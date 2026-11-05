'use strict';
/**
 * Assistente de Consulta — recupera o que o USUÁRIO já escreveu. Não resolve questões, não inventa conteúdo.
 *
 *  consult()        pesquisa por tema ou por enunciado colado; devolve notas ordenadas + trechos originais
 *  prepareComment() monta um comentário só com trechos literais das notas escolhidas, com fontes
 *  markFeedback()   "útil"/"irrelevante" — ajusta a ordenação de consultas parecidas
 *  setSynthesizer() ponto de extensão OPCIONAL para IA (desligado por padrão; exige autorização explícita)
 *
 * Os números de "score" são um indicador interno e comparativo de relevância, não uma probabilidade de acerto.
 */
const { norm, tokens, levenshtein } = require('./text');

// ---------- vocabulário de ruído ----------
const STOP = new Set(('a o as os um uma uns umas de do da dos das dum duma em no na nos nas num numa por pelo pela pelos pelas para pra ' +
  'com sem sob sobre entre ate desde apos perante durante mediante conforme segundo e ou mas nem que se como ao aos quando onde qual quais ' +
  'quanto quantos cujo cuja cujos cujas isso isto esse essa esses essas este esta estes estas aquele aquela aquilo ele ela eles elas voce ' +
  'voces seu sua seus suas meu minha nosso sao foi foram sera serao era eram ser sendo sido ter tem tinha tendo ha havia nao sim mais menos ' +
  'muito muita muitos muitas ja tambem so apenas ainda todo toda todos todas outro outra outros outras mesmo mesma cada qualquer algum ' +
  'alguma alguns algumas nenhum nenhuma tal tais assim entao porem contudo todavia entretanto porque pois logo ' +
  'assinale alternativa alternativas correta correto corretas corretos incorreta incorreto incorretas incorretos julgue item itens seguir ' +
  'seguinte seguintes acerca considere considerando afirmativa afirmativas afirmacao afirmacoes questao assertiva assertivas verdadeira ' +
  'verdadeiro verdadeiras falsa falso falsas certo errado apresentada apresentado apresentadas analise texto abaixo acima respeito ' +
  'referente relacao proposicao sentenca opcao letra exceto').split(/\s+/));

const isNoise = (t) => STOP.has(t) || t.length < 2;

// Radical aproximado em português (singular/plural, gênero, -ção/-ções).
function stemOf(t) {
  if (/\d/.test(t) || t.length < 4) return t;
  let s = t;
  if (/(oes|aes)$/.test(s)) return s.slice(0, -3);
  if (s.endsWith('s')) s = s.slice(0, -1);
  if (/ao$/.test(s) && s.length >= 6) return s.slice(0, -2);
  if (s.length >= 7 && /[oae]$/.test(s)) s = s.slice(0, -1);
  return s;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B = '(?<![\\p{L}\\p{N}])';
const NB = '[^\\p{L}\\p{N}]+';

const stemSrc = (stem) => (stem.length <= 3 ? `${B}${esc(stem)}s?(?![\\p{L}\\p{N}])` : `${B}${esc(stem)}[\\p{L}\\p{N}]*`);
const phraseSrc = (toks) => `${B}${toks.map((t) => esc(stemOf(t))).join(`[\\p{L}\\p{N}]*${NB}`)}`;
const variantSrc = (v) => (v.type === 'stem' ? stemSrc(v.stem) : phraseSrc(v.tokens));

const ftsOf = (v) => {
  if (v.type === 'phrase') return `"${v.tokens.join(' ')}"`;
  return v.stem.length <= 3 ? `("${v.stem}" OR "${v.stem}s")` : `"${v.stem}"*`;
};

// norm() com mapa de posições para destacar trechos no texto original (acentos não mudam o comprimento do mapa).
function normMap(s) {
  let out = '';
  const map = [];
  for (let i = 0; i < s.length; i++) {
    const n = s[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const ch of n) { out += ch; map.push(i); }
  }
  return { out, map };
}

// ---------- vocabulário (frequência de documentos) ----------
const vocabMaps = new WeakMap();
function vocabInfo(lib) {
  const arr = lib.vocabulary();
  let info = vocabMaps.get(arr);
  if (!info) { info = { arr, N: lib.noteCount() }; vocabMaps.set(arr, info); }
  return info;
}
function docFreqStem(info, stem) {
  let best = 0;
  const short = stem.length <= 3;
  for (const v of info.arr) {
    const ok = short ? (v.term === stem || v.term === stem + 's') : v.term.startsWith(stem);
    if (ok && v.doc > best) best = v.doc;
  }
  return best;
}
function docFreqPhrase(lib, tokensArr) {
  try {
    return lib.db.prepare('SELECT COUNT(*) AS c FROM notes_fts WHERE notes_fts MATCH ?').get(`"${tokensArr.join(' ')}"`).c;
  } catch { return 0; }
}

// ---------- análise da consulta ----------
function makeGroup(label, variants, weight, extra = {}) {
  const src = variants.map(variantSrc).join('|');
  return { label, variants, weight, rx: new RegExp(src, 'u'), rxg: new RegExp(src, 'gu'), ...extra };
}

/**
 * Identifica os termos-chave do texto: remove palavras vazias e fórmulas de enunciado,
 * pondera pela raridade na biblioteca (IDF), usa sinônimos cadastrados e corrige pequenos erros de digitação.
 */
function analyze(lib, text, { mode = 'statement', maxTerms = 12 } = {}) {
  const info = vocabInfo(lib);
  const N = Math.max(info.N, 1);
  const toks = tokens(text);
  const groups = [];
  const used = new Set();
  const dropped = [];

  // 1) sinônimos de várias palavras ("mérito administrativo" ↔ "revogação")
  for (let i = 0; i < toks.length; i++) {
    for (let len = Math.min(4, toks.length - i); len >= 2; len--) {
      const span = toks.slice(i, i + len);
      if (isNoise(span[0]) || isNoise(span[len - 1])) continue;
      const syns = lib.synonymsOf(span.join(' '));
      if (!syns.length) continue;
      const variants = [{ type: 'phrase', tokens: span }];
      syns.forEach((s) => { const st = tokens(s); if (st.length === 1) variants.push({ type: 'stem', stem: stemOf(st[0]) }); else if (st.length) variants.push({ type: 'phrase', tokens: st }); });
      const df = Math.max(...variants.map((v) => (v.type === 'stem' ? docFreqStem(info, v.stem) : docFreqPhrase(lib, v.tokens))));
      groups.push(makeGroup(span.join(' '), variants, Math.log(1 + N / Math.max(df, 1)) * 1.2, { pos: i, via: 'sinônimo', df }));
      for (let k = i; k < i + len; k++) used.add(k);
      i += len - 1; break;
    }
  }

  // 2) termos individuais
  const seen = new Set();
  toks.forEach((t, i) => {
    if (used.has(i) || isNoise(t) || seen.has(t)) return;
    seen.add(t);
    const stem = stemOf(t);
    let df = docFreqStem(info, stem);
    const variants = [{ type: 'stem', stem }];
    let corrected = null; let via = null;
    for (const s of lib.synonymsOf(t)) {
      const st = tokens(s);
      if (st.length === 1) variants.push({ type: 'stem', stem: stemOf(st[0]) }); else if (st.length) variants.push({ type: 'phrase', tokens: st });
      via = 'sinônimo';
      df = Math.max(df, ...(st.length === 1 ? [docFreqStem(info, stemOf(st[0]))] : [docFreqPhrase(lib, st)]));
    }
    if (df === 0 && t.length >= 5 && !/\d/.test(t)) {
      const max = t.length >= 8 ? 2 : 1;
      let best = null;
      for (const v of info.arr) {
        if (v.term !== t && levenshtein(t, v.term, max) <= max && (!best || v.doc > best.doc)) best = v;
      }
      if (best) { variants.push({ type: 'stem', stem: stemOf(best.term) }); corrected = best.term; df = best.doc; }
    }
    if (df === 0) { dropped.push(t); return; }
    if (mode === 'statement' && N >= 20 && df / N > 0.6) { dropped.push(t); return; }
    groups.push(makeGroup(t, variants, Math.log(1 + N / df), { pos: i, df, corrected, via }));
  });

  groups.sort((a, b) => b.weight - a.weight);
  const kept = mode === 'statement' ? groups.slice(0, maxTerms) : groups.slice(0, 12);
  kept.sort((a, b) => a.pos - b.pos);

  // 3) pares de palavras vizinhas (bônus de ordenação)
  const bigrams = [];
  for (let i = 0; i + 1 < toks.length; i++) {
    const a = kept.find((g) => g.pos === i && !g.via); const b = kept.find((g) => g.pos === i + 1 && !g.via);
    if (a && b) {
      const src = phraseSrc([toks[i], toks[i + 1]]);
      bigrams.push({ label: `${toks[i]} ${toks[i + 1]}`, rx: new RegExp(src, 'u'), rxg: new RegExp(src, 'gu'), bonus: 0.4 * (a.weight + b.weight), fts: `"${toks[i]} ${toks[i + 1]}"` });
    }
  }
  const stemSet = new Set(toks.filter((t) => !isNoise(t)).map(stemOf));
  return { groups: kept, bigrams, dropped, stemSet, totalWeight: kept.reduce((s, g) => s + g.weight, 0) };
}

// ---------- recuperação e ordenação ----------
function candidates(lib, an, { folderId, limit = 80 } = {}) {
  const parts = [];
  an.groups.forEach((g) => g.variants.forEach((v) => parts.push(ftsOf(v))));
  an.bigrams.forEach((b) => parts.push(b.fts));
  if (!parts.length) return [];
  const where = ['notes_fts MATCH ?', 'n.deleted_at IS NULL', 'n.archived = 0'];
  if (folderId != null) where.push(`n.folder_id IN (${lib.descendantFolderIds(folderId).map(Number).join(',')})`);
  try {
    return lib.db.prepare(
      `SELECT n.id, n.title, n.folder_id AS folderId, n.favorite, n.updated_at AS updatedAt, n.content_text AS body
       FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
       WHERE ${where.join(' AND ')} ORDER BY bm25(notes_fts, 10.0, 1.0, 4.0, 2.0) LIMIT ${limit}`
    ).all(parts.join(' OR ')).map((r) => ({ ...r }));
  } catch { return []; }
}

const countMatches = (rxg, s, cap = 6) => { let c = 0; for (const _ of s.matchAll(rxg)) { if (++c >= cap) break; } return c; };

function scoreRow(lib, row, an) {
  const tags = lib.noteTags(row.id);
  const path = row.folderId != null ? lib.folderPath(row.folderId) : '';
  const t = norm(row.title); const b = norm(row.body); const tg = norm(tags.join(' ')); const p = norm(path);
  let score = 0; let matchedW = 0;
  const matched = []; const reasons = new Set();
  for (const g of an.groups) {
    const inT = g.rx.test(t); const inTag = g.rx.test(tg); const inP = g.rx.test(p); const cnt = countMatches(g.rxg, b);
    if (!(inT || inTag || inP || cnt)) continue;
    matched.push(g); matchedW += g.weight;
    if (inT) reasons.add('título'); if (inTag) reasons.add('etiqueta'); if (inP) reasons.add('disciplina/pasta'); if (cnt) reasons.add('conteúdo');
    score += g.weight * ((inT ? 1.2 : 0) + (inTag ? 0.7 : 0) + (inP ? 0.4 : 0) + (cnt ? 0.6 + Math.min(0.4, 0.1 * (cnt - 1)) : 0));
  }
  for (const bg of an.bigrams) {
    if (bg.rx.test(t)) score += bg.bonus * 1.5; else if (bg.rx.test(b)) score += bg.bonus;
  }
  return { score, coverage: an.totalWeight ? matchedW / an.totalWeight : 0, matched, reasons: [...reasons], tags, path };
}

// ---------- trechos originais ----------
function chunks(text) {
  const out = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const start = offset; offset += line.length + 1;
    if (!line.trim()) continue;
    if (line.length <= 700) { out.push({ text: line.trim(), start }); continue; }
    const re = /[^.!?;:]+[.!?;:]+\s*|[^.!?;:]+$/g; let m; let cur = ''; let curStart = start;
    while ((m = re.exec(line))) {
      if (cur && (cur + m[0]).length > 600) { out.push({ text: cur.trim(), start: curStart }); cur = ''; curStart = start + m.index; }
      cur += m[0];
    }
    if (cur.trim()) out.push({ text: cur.trim(), start: curStart });
  }
  return out;
}

function passagesFor(body, an, max = 3) {
  const scored = [];
  chunks(body).forEach((c, index) => {
    const { out, map } = normMap(c.text);
    let s = 0; const ranges = []; const terms = new Set();
    for (const g of an.groups) {
      let hit = false;
      for (const m of out.matchAll(g.rxg)) { hit = true; ranges.push([map[m.index], map[m.index + m[0].length - 1] + 1]); }
      if (hit) { s += g.weight; terms.add(g.label); }
    }
    for (const bg of an.bigrams) if (bg.rx.test(out)) s += bg.bonus;
    if (s > 0) scored.push({ text: c.text, index, score: s, ranges: mergeRanges(ranges), terms: [...terms] });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, max);
}
function mergeRanges(r) {
  r.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of r) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([...x]); }
  return out;
}

// ---------- feedback ----------
const jaccard = (a, b) => { let i = 0; a.forEach((x) => { if (b.has(x)) i++; }); return i / (a.size + b.size - i || 1); };
function feedbackAdjust(lib, ids, stemSet) {
  const adj = new Map(); const own = new Map();
  for (const r of lib.feedbackRows(ids)) {
    const j = jaccard(stemSet, new Set(r.terms.split(' ')));
    if (j >= 0.4) adj.set(r.noteId, (adj.get(r.noteId) || 0) + r.value * j);
    if (j === 1) own.set(r.noteId, r.value);
  }
  return { adj, own };
}

const discipline = (path) => (path ? path.split(' / ')[0] : '');

const NO_MATCH = 'Nenhuma anotação sua tem correspondência suficientemente relevante para este texto. Nada foi inferido nem inventado — se o assunto ainda não está na biblioteca, vale registrá-lo.';

/**
 * @param {{mode:'theme'|'statement', text:string, folderId?:number, limit?:number, record?:boolean}} q
 */
function consult(lib, q) {
  const mode = q.mode === 'theme' ? 'theme' : 'statement';
  const text = String(q.text ?? '').slice(0, 12000);
  const an = analyze(lib, text, { mode });
  const base = { mode, query: text, keyTerms: an.groups.map((g) => ({ term: g.label, weight: Math.round(g.weight * 100) / 100, corrected: g.corrected, via: g.via })), ignored: an.dropped };
  if (q.record) lib.recordConsult(mode, text);
  if (!an.groups.length) {
    const message = !text.trim() ? 'Digite um tema ou cole o enunciado.'
      : an.dropped.length ? NO_MATCH : 'Não identifiquei termos de assunto neste texto (só fórmulas de enunciado).';
    return { ...base, results: [], sufficient: false, message };
  }
  const T = an.groups.length;
  const rows = candidates(lib, an, { folderId: q.folderId });
  const scored = rows.map((r) => ({ r, s: scoreRow(lib, r, an) })).filter(({ s }) => (
    mode === 'theme' ? s.matched.length >= 1 && (T === 1 || s.coverage >= 0.4)
      : s.matched.length >= Math.min(2, T) && s.coverage >= 0.3));
  const { adj, own } = feedbackAdjust(lib, scored.map((x) => x.r.id), an.stemSet);
  scored.forEach((x) => { x.final = x.s.score * Math.max(0.15, 1 + 0.35 * Math.max(-2, Math.min(2, adj.get(x.r.id) || 0))); });
  scored.sort((a, b) => b.final - a.final);
  const results = scored.slice(0, q.limit ?? 15).map(({ r, s, final }) => ({
    id: r.id, title: r.title, path: s.path, discipline: discipline(s.path), tags: s.tags, favorite: !!r.favorite, updatedAt: r.updatedAt,
    score: Math.round(final * 100) / 100,
    matchedTerms: s.matched.map((g) => g.label), totalTerms: T, coverage: Math.round(s.coverage * 100) / 100,
    partial: s.matched.length < T, reasons: s.reasons,
    passages: passagesFor(r.body, an), feedback: own.get(r.id) || 0,
  }));
  return { ...base, results, sufficient: results.length > 0, message: results.length ? '' : NO_MATCH };
}

function markFeedback(lib, noteId, queryText, value) {
  const an = analyze(lib, queryText, { mode: 'theme' });
  const terms = [...an.stemSet].sort().join(' ');
  if (!terms) return false;
  lib.addFeedback(noteId, terms, value);
  return true;
}

module.exports = { consult, analyze, stemOf };

'use strict';
/**
 * Motor de pesquisa em camadas.
 *  Camada 1: texto completo (FTS5), frases exatas, títulos/etiquetas/caminho.
 *  Camada 2: sem acentos, plural/singular aproximado, sinônimos cadastrados, correção de digitação.
 *  Camada 3: pesquisa semântica — ponto de extensão (SemanticProvider), não implementado nesta versão.
 *  Camada 4: ordenação combinada (BM25 com pesos por campo).
 *
 * O "score" retornado é um indicador INTERNO de relevância (quanto maior, mais relevante).
 * Não é probabilidade de acerto.
 */
const { norm, tokens, levenshtein } = require('./text');

/** Interface para pesquisa conceitual futura: { search(query, lib) -> [{id, score}] } */
let semanticProvider = null;
const setSemanticProvider = (p) => { semanticProvider = p; };

// Junta palavras vizinhas que formam um sinônimo cadastrado de várias palavras (ex.: "mérito administrativo").
function mergeSynonymPhrases(lib, groups) {
  const out = [];
  for (let i = 0; i < groups.length;) {
    let merged = false;
    if (!groups[i].exact) {
      for (let j = Math.min(groups.length, i + 4); j > i + 1 && !merged; j--) {
        const span = groups.slice(i, j);
        if (span.some((g) => g.exact)) continue;
        const raw = span.map((g) => g.raw).join(' ');
        if (lib.synonymsOf(raw).length) {
          out.push({ tokens: span.flatMap((g) => g.tokens), exact: true, raw });
          i = j; merged = true;
        }
      }
    }
    if (!merged) out.push(groups[i++]);
  }
  return out;
}

function parseQuery(q) {
  const groups = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(q ?? '')))) {
    const t = tokens(m[1] ?? m[2]);
    if (t.length) groups.push({ tokens: t, exact: m[1] !== undefined, raw: t.join(' ') });
  }
  return groups;
}

const phrase = (toks, prefix = false) => `"${toks.join(' ')}"${prefix ? '*' : ''}`;

// Aproximação simples de singular/plural: usa o radical sem o "s" final como prefixo.
function stemExpr(tok) {
  if (tok.length >= 5 && tok.endsWith('s')) return `"${tok.slice(0, -1)}"*`;
  return `"${tok}"`;
}

function groupAlternatives(lib, g, { incremental, isLast, fuzzy }) {
  const alts = [];
  const matched = new Set(g.tokens);
  if (g.exact || g.tokens.length > 1) {
    alts.push(phrase(g.tokens, incremental && isLast && !g.exact));
  } else {
    const tok = g.tokens[0];
    alts.push(incremental && isLast ? phrase([tok], true) : stemExpr(tok));
  }
  for (const syn of lib.synonymsOf(g.raw)) {
    const st = tokens(syn);
    if (st.length) { alts.push(phrase(st)); st.forEach((t) => matched.add(t)); }
  }
  const corrections = [];
  if (fuzzy && g.tokens.length === 1 && g.tokens[0].length >= 4) {
    const tok = g.tokens[0];
    const max = tok.length >= 7 ? 2 : 1;
    const cands = lib.vocabulary()
      .filter((v) => v.term !== tok && levenshtein(tok, v.term, max) <= max)
      .sort((a, b) => b.doc - a.doc).slice(0, 4);
    for (const c of cands) { alts.push(phrase([c.term])); matched.add(c.term); corrections.push(c.term); }
  }
  return { expr: alts.length > 1 ? `(${alts.join(' OR ')})` : alts[0], matched, corrections };
}

function runFts(lib, groups, mode, opts, fuzzy) {
  const exprs = [];
  const matched = new Set();
  const corrections = [];
  groups.forEach((g, i) => {
    const r = groupAlternatives(lib, g, { incremental: !!opts.incremental, isLast: i === groups.length - 1, fuzzy });
    exprs.push(r.expr);
    r.matched.forEach((t) => matched.add(t));
    corrections.push(...r.corrections);
  });
  const match = exprs.join(mode === 'AND' ? ' AND ' : ' OR ');

  const where = ['notes_fts MATCH ?', 'n.deleted_at IS NULL'];
  const params = [match];
  if (!opts.includeArchived) where.push('n.archived = 0');
  if (opts.folderId != null) {
    where.push(`n.folder_id IN (${lib.descendantFolderIds(opts.folderId).map(Number).join(',')})`);
  }
  if (opts.since) { where.push('n.updated_at >= ?'); params.push(new Date(opts.since).toISOString()); }
  if (opts.tag) {
    where.push('EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = n.id AND t.key = ?)');
    params.push(norm(String(opts.tag).replace(/^#/, '')));
  }
  const limit = Math.min(Number(opts.limit) || 30, 200);
  let rows;
  try {
    rows = lib.db.prepare(
      `SELECT n.id, n.title, n.folder_id AS folderId, n.favorite, n.updated_at AS updatedAt, n.content_text AS body,
              snippet(notes_fts, 1, '[[', ']]', '…', 28) AS snippet,
              bm25(notes_fts, 10.0, 1.0, 4.0, 2.0) AS rank
       FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
       WHERE ${where.join(' AND ')} ORDER BY rank LIMIT ${limit}`
    ).all(...params);
  } catch (e) {
    return { rows: [], matched, corrections, error: e.message };
  }
  return { rows, matched, corrections };
}

function shape(lib, r, matched) {
  const tags = lib.noteTags(r.id);
  const path = r.folderId != null ? lib.folderPath(r.folderId) : '';
  const has = (field) => { const f = norm(field); return [...matched].some((t) => f.includes(t)); };
  const reasons = [];
  if (has(r.title)) reasons.push('título');
  if (tags.some(has)) reasons.push('etiqueta');
  if (has(path)) reasons.push('disciplina/pasta');
  if (has(r.body)) reasons.push('conteúdo');
  const nb = norm(r.body);
  const found = [...matched].filter((t) => nb.includes(t) || norm(r.title).includes(t));
  let snippet = r.snippet;
  if (!snippet.includes('[[')) snippet = r.body.slice(0, 160) + (r.body.length > 160 ? '…' : '');
  return {
    id: r.id, title: r.title, path, tags, snippet, reasons, matchedTerms: found,
    favorite: !!r.favorite, updatedAt: r.updatedAt,
    score: Math.round(-r.rank * 100) / 100, // indicador interno de relevância
  };
}

/**
 * @param {import('./library').Library} lib
 * @param {string} q
 * @param {{folderId?:number, tag?:string, since?:string, limit?:number, incremental?:boolean, includeArchived?:boolean}} opts
 * @returns {{results:object[], mode:string, corrected:string[], query:string}}
 *   mode: 'all' (todos os termos), 'fuzzy' (com correção de digitação), 'any' (alguns termos), 'empty'
 */
function search(lib, q, opts = {}) {
  const groups = mergeSynonymPhrases(lib, parseQuery(q));
  if (!groups.length) return { results: [], mode: 'empty', corrected: [], query: q };

  const attempts = [['AND', false, 'all'], ['AND', true, 'fuzzy'], ['OR', true, 'any']];
  if (groups.length === 1) attempts.splice(2, 1); // com um só termo, OR = AND
  for (const [mode, fuzzy, label] of attempts) {
    if (fuzzy && opts.incremental) continue; // enquanto digita, não "corrige"
    const { rows, matched, corrections } = runFts(lib, groups, mode, opts, fuzzy);
    if (rows.length) {
      if (label === 'fuzzy' && !corrections.length) continue;
      return { results: rows.map((r) => shape(lib, r, matched)), mode: label, corrected: [...new Set(corrections)], query: q };
    }
  }
  return { results: [], mode: 'none', corrected: [], query: q };
}

module.exports = { search, parseQuery, setSemanticProvider, _semantic: () => semanticProvider };

'use strict';
// Uso (fora da pasta do projeto): BIZUTECA_DIR=/caminho/do/projeto TZ=America/Sao_Paulo node --no-warnings repro.js
const R = require('node:path').resolve(process.env.BIZUTECA_DIR || process.cwd()) + '/';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), zlib = require('node:zlib');
const { Library } = require(R + 'src/core/library');
const storage = require(R + 'src/core/storage');
const backups = require(R + 'src/core/backups');
const { htmlToText } = require(R + 'src/core/text');
const { search } = require(R + 'src/core/search');
const { sanitizeExportHtml } = require(R + 'src/core/export');
const { importTextFiles } = require(R + 'src/core/text-import');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'repro-'));
const mk = (dir) => { const lib = new Library(path.join(dir, 'biblioteca.db'), { versionIntervalMs: 0 }); storage.extendSchema(lib); return lib; };
const out = (id, data) => console.log(id + ' ' + JSON.stringify(data));

// B1: retenção de backups automáticos apaga o mais recente do dia (fuso UTC-3)
{
  const d = tmp();
  const early = backups.backupName(new Date('2026-11-06T15:00:00Z'), 'auto'); // 12:00 em Sao Paulo
  const late = backups.backupName(new Date('2026-11-07T00:31:00Z'), 'auto');  // 21:31 em Sao Paulo
  fs.writeFileSync(path.join(d, early), 'x'); fs.writeFileSync(path.join(d, late), 'x');
  backups.retainAutomatic(d);
  out('B1', { tz: process.env.TZ, criados: [early.slice(0, 26), late.slice(0, 26)], restaram: fs.readdirSync(d).map(n => n.slice(0, 26)) });
}

// B2: htmlToText
out('B2a-tabela', htmlToText('<table><tr><td>Planejamento</td><td>Organização</td></tr></table>'));
out('B2b-entidade', htmlToText('<p>Regra &aacute; &eacute; &#233; &ccedil;&atilde;o</p>'));
out('B2c-style', htmlToText('<html><head><title>T</title><style>p{color:red}</style></head><body><p>Texto</p><script>var x=1</script></body></html>'));
{
  const d = tmp(); const lib = mk(d);
  lib.createNote({ title: 'Tabela', contentHtml: '<table><tr><td>Planejamento</td><td>Organização</td></tr></table>' });
  out('B2d-busca-segunda-celula', search(lib, 'organizacao').results.length);
  lib.close();
}

// B3: referência de imagem sem arquivo bloqueia qualquer backup
{
  const d = tmp(); const lib = mk(d);
  lib.createNote({ title: 'Com imagem', contentHtml: '<p><img src="tv-attachment://aaaaaaaa-1111-2222.png"></p>' });
  let r1, r2;
  try { storage.encodePackage(lib, d); r1 = 'ok'; } catch (e) { r1 = e.message; }
  try { backups.writeBackup(lib, d, { automatic: true }); r2 = 'ok'; } catch (e) { r2 = e.message; }
  out('B3', { encodePackage: r1, writeBackupAutomatico: r2 });
  lib.close();
}

// B4/B8: mesclagem
{
  const dt = tmp(), di = tmp(); const target = mk(dt), inc = mk(di);
  const f = inc.createFolder({ name: 'Matéria' }); inc.setFolderFavorite(f, true);
  const a = inc.createNote({ title: 'A', folderId: f, contentHtml: '<p>v1</p>', tags: ['x'] });
  const b = inc.createNote({ title: 'B', folderId: f, contentHtml: '<p>b</p>' });
  inc.updateNote(a, { contentHtml: '<p>v2</p>' }); inc.updateNote(a, { contentHtml: '<p>v3</p>' });
  inc.linkNotes(a, b);
  const arq = inc.createNote({ title: 'Arquivada', folderId: f, contentHtml: '<p>arq</p>' }); inc.archiveNote(arq, true);
  const tf = target.createFolder({ name: 'Matéria' });
  const same = target.createNote({ title: 'B', folderId: tf, contentHtml: '<p>b</p>' });
  inc.setTags(b, ['etiqueta-nova']);
  const rep = storage.mergeLibraries(target, inc);
  const nA = target.listNotes().find(n => n.title === 'A');
  const vers = target.listVersions(nA.id).map(v => ({ id: v.id, savedAt: v.savedAt, html: target.getVersion(v.id).contentHtml }));
  out('B4a-versoes-no-destino (id desc, deveria ser savedAt desc)', vers);
  out('B4b-favorito-da-pasta', target.listFolders().find(x => x.name === 'Matéria').favorite);
  out('B4c-vinculos', { A: target.listRelatedNotes(nA.id).length, comparacaoOrigem: inc.listRelatedNotes(a).length });
  out('B4d-etiquetas-da-nota-repetida', { destino: target.noteTags(same), origem: inc.noteTags(b), relatorio: rep });
  out('B8-arquivada', { visiveis: target.listNotes().map(n => n.title), arquivadas: target.listNotes({ archived: true }).map(n => n.title), busca: search(target, 'arq').results.length });
  target.close(); inc.close();
}

// B5/B6: anexos órfãos, reutilização de id e duplicar nota
{
  const d = tmp(); const lib = mk(d);
  const n1 = lib.createNote({ title: 'Antiga', contentHtml: '<p>a</p>', favorite: true });
  lib.db.prepare('INSERT INTO biz_files(note_id,name,file,mime) VALUES(?,?,?,?)').run(n1, 'prova.pdf', 'uuid-1.pdf', 'pdf');
  const dup = lib.duplicateNote(n1);
  out('B6-duplicar', { anexosDaCopia: lib.db.prepare('SELECT COUNT(*) c FROM biz_files WHERE note_id=?').get(dup).c, favoritaCopia: lib.getNote(dup).favorite });
  lib.purgeNote(dup);
  lib.purgeNote(n1);
  const n2 = lib.createNote({ title: 'Nova', contentHtml: '<p>b</p>' });
  out('B5', { idAntigo: n1, idNovo: n2, anexosHerdadosPelaNovaNota: lib.db.prepare('SELECT name FROM biz_files WHERE note_id=?').all(n2).map(r => r.name), linhasOrfasAposPurge: lib.db.prepare('SELECT COUNT(*) c FROM biz_files').get().c });
  lib.close();
}

// B9: extensão perigosa aceita no pacote
{
  const d = tmp(); const lib = mk(d);
  const raw = storage.encodePackage(lib, d);
  const magic = Buffer.from('BIZUTECA9MM1\n');
  const doc = JSON.parse(zlib.inflateSync(raw.subarray(magic.length)).toString('utf8'));
  const bytes = Buffer.from('calc.exe');
  doc.images.push({ name: 'evil.bat', data: bytes.toString('base64'), sha256: storage.hash(bytes) });
  const crafted = Buffer.concat([magic, zlib.deflateSync(Buffer.from(JSON.stringify(doc)))]);
  let r; try { r = storage.decodePackage(crafted).images.map(i => i.name); } catch (e) { r = 'rejeitado: ' + e.message; }
  out('B9', { safeNameBat: storage.safeName('evil.bat'), safeNameExe: storage.safeName('x.exe'), pacoteComBat: r });
  lib.close();
}

// B10: realce de trecho com acento (função real do renderer)
{
  const src = fs.readFileSync(R + 'src/renderer/app.js', 'utf8');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const m = src.match(/function snippetHtml[^\n]*\n/)[0];
  const snippetHtml = new Function('esc', m + '; return snippetHtml;')(esc);
  out('B10', snippetHtml('A regência verbal exige preposição', ['regencia', 'preposicao']));
}

// B11: sanitizador de exportação perde formatação
out('B11', sanitizeExportHtml('<p style="color:#c00">Texto <mark>marcado</mark></p><div class="bizu"><span class="callout-label">BIZU</span><p>dica</p></div><font color="#00f">azul</font>'));

// B12: TXT em ANSI (Windows-1252)
{
  const d = tmp(); const lib = mk(d);
  const f = path.join(d, 'regência.txt'); fs.writeFileSync(f, Buffer.from('Regência verbal\n', 'latin1'));
  let r; try { r = importTextFiles(lib, [f]); } catch (e) { r = e.message; }
  out('B12', r);
  lib.close();
}
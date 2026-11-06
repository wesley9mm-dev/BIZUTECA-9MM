'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {Library} = require('../src/core/library');
const {importTextFiles} = require('../src/core/text-import');
const {safeName,decodePackage,hash} = require('../src/core/storage');
const {deflateSync} = require('node:zlib');

test('importação em lote preserva acentos e desfaz o lote quando um arquivo falha', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biz-import-'));
  const lib = new Library(':memory:');
  t.after(() => { lib.close(); fs.rmSync(dir,{recursive:true,force:true}); });
  const first = path.join(dir,'regência.txt');
  const second = path.join(dir,'sintaxe.txt');
  fs.writeFileSync(first,Buffer.concat([Buffer.from([255,254]),Buffer.from('Ação < B\r\nCrase','utf16le')]));
  fs.writeFileSync(second,Buffer.from([255]));
  lib.createNote({title:'Nota anterior'});
  assert.throws(() => importTextFiles(lib,[first,second]), /Codificação inválida/);
  assert.equal(lib.noteCount(),1);
  fs.writeFileSync(second,'Sujeito');
  assert.equal(importTextFiles(lib,[first,second]),2);
  const note = lib.listNotes().find(item => item.title === 'regência');
  assert.match(lib.getNote(note.id).contentHtml,/Ação &lt; B<br>Crase/);
});

test('pacote rejeita nomes reservados e colisões no Windows', () => {
  assert.equal(safeName('CON.png'),false);
  assert.equal(safeName('lpt1.txt'),false);
  assert.equal(safeName('foto-1.png'),true);
  const database = Buffer.from('SQLite format 3\0');
  const bytes = Buffer.from('conteúdo');
  const doc = {format:'bizuteca-9mm',version:1,database:database.toString('base64'),sha256:hash(database),
    images:['Foto.png','foto.PNG'].map(name => ({name,data:bytes.toString('base64'),sha256:hash(bytes)}))};
  assert.throws(() => decodePackage(Buffer.concat([Buffer.from('BIZUTECA9MM1\n'),deflateSync(JSON.stringify(doc))])), /Anexo inválido/);
});

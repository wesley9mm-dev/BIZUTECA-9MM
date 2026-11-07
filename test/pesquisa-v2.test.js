'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Library}=require('../src/core/library'),{search}=require('../src/core/search'),{consult}=require('../src/core/assistant');
test('siglas, user dictionary, numbers, stems, literal phrases and missing topics',t=>{
 const lib=new Library();t.after(()=>lib.close());
 const id=lib.createNote({title:'Licitação',contentHtml:'<p>A medida provisória dura sessenta dias. A Lei 14.133 rege a licitação.</p>'});
 for(const q of ['licitar','licitações','MP','60 dias','14133','"medida provisória"'])assert.equal(search(lib,q).results[0]?.id,id,q);
 assert.match(search(lib,'licitar').results[0].snippet,/\[\[licitação\]\]/);
 assert.equal(search(lib,'fotossíntese').results.length,0);
 assert.equal(search(lib,'"assunto ausente" licitação').results.length,0);
 lib.saveAbbreviation('LCP','licitação');assert.equal(search(lib,'LCP').results[0].id,id);
 assert.equal(consult(lib,{text:'licitar',mode:'theme'}).results[0].id,id);
});

test('derived FTS migration keeps notes and versions unchanged',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'search-migrate-')),file=path.join(dir,'library.db');
 let lib=new Library(file,{versionIntervalMs:0});const id=lib.createNote({contentHtml:'<p>Antes</p>'});lib.updateNote(id,{contentHtml:'<p>Licitação</p>'});
 const before=lib.getNote(id),versions=lib.listVersions(id);
 lib.db.exec("DROP TABLE notes_vocab;DROP TABLE notes_fts;CREATE VIRTUAL TABLE notes_fts USING fts5(title,body,tags,path);CREATE VIRTUAL TABLE notes_vocab USING fts5vocab(notes_fts,'row');DELETE FROM meta WHERE key='search_schema';");lib.close();
 lib=new Library(file);t.after(()=>{lib.close();fs.rmSync(dir,{recursive:true,force:true});});
 assert.deepEqual(lib.getNote(id),before);assert.deepEqual(lib.listVersions(id),versions);
 assert.equal(search(lib,'licitar').results[0].id,id);
});

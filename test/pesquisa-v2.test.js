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

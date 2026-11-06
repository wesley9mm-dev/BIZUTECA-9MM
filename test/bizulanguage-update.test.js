'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Library}=require('../src/core/library');
const course=require('../src/core/bizulanguage');
const {search}=require('../src/core/search');
const levels={I:'Iniciante',M:'Intermediário',A:'Avançado',V:'Aumentar vocabulário'};
const codes=['en','es','fr','it'];
// Recreate the previous release's actual content, not a v2 install with a marker removed.
function legacy(t){
 const lib=new Library();t.after(()=>lib.close());
 for(const c of codes){const d=require('../src/data/bizulanguage/'+c+'.json');const parent=lib.createFolder({name:d.name});
  for(const [k,name] of Object.entries(levels)){const folderId=lib.createFolder({name,parentId:parent});
   for(const l of d.lessons[k])lib.createNote({folderId,title:l.title,contentHtml:course.lessonHtml(l),tags:['BizuLanguage',d.name,name]});}}
 lib.db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('bizulanguage_v1','1');
 return lib;
}
test('v1 upgrade preserves edited, moved, archived and deleted lessons and adds exactly 64',t=>{
 const lib=legacy(t);const notes=lib.listNotes();assert.equal(notes.length,113);
 const personal=lib.createFolder({name:'Meu caderno'});
 lib.updateNote(notes[0].id,{title:'Título pessoal',contentHtml:'<p>Meu acréscimo pessoal</p>',favorite:true});
 lib.moveNote(notes[1].id,personal);lib.archiveNote(notes[2].id);lib.deleteNote(notes[3].id);
 const snapshots=notes.slice(0,4).map(n=>lib.getNote(n.id));
 assert.equal(course.installed(lib),false);
 assert.equal(course.install(lib),64);
 for(let i=0;i<4;i++)assert.deepEqual(lib.getNote(notes[i].id),snapshots[i]);
 assert.equal(lib.db.prepare('SELECT count(*) AS n FROM notes').get().n,177);
 assert.equal(course.install(lib),0);
 assert.equal(lib.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.ok(search(lib,'"pronomes combinados"').results.length);
});
test('v1 failed expansion rolls back new folders, notes and marker; retry succeeds',t=>{
 const lib=legacy(t);const before=lib.listNotes().map(n=>lib.getNote(n.id));
 const original=lib.createNote;let calls=0;
 lib.createNote=function(n){if(++calls===7)throw Error('falha durante atualização');return original.call(this,n);};
 assert.throws(()=>course.install(lib),/falha durante atualização/);
 assert.equal(course.installed(lib),false);
 assert.deepEqual(lib.listNotes().map(n=>lib.getNote(n.id)),before);
 lib.createNote=original;assert.equal(course.install(lib),64);assert.equal(course.install(lib),0);
});
test('text-only curriculum has unique titles, complete exercises and signatures',()=>{
 let count=0;
 for(const code of codes){
  const base=require('../src/data/bizulanguage/'+code+'.json');
  const expansion=require('../src/data/bizulanguage/'+code+'-expansion.json');
  for(const k of Object.keys(levels)){
   const titles=[...base.lessons[k],...expansion.lessons[k]].map(l=>l.title);
   assert.equal(new Set(titles).size,titles.length,code+'/'+k);
   for(const l of expansion.lessons[k]){
    count++;
    for(const field of ['objective','rule','bizu','trap','practice','answer','summary'])assert.ok(l[field]?.trim(),l.title+': '+field);
    assert.ok(l.examples.length>=3,l.title);
    assert.ok(l.links.every(([,url])=>url.startsWith('https://')));
    const html=course.lessonHtml(l);
    assert.doesNotMatch(html,/<(?:img|audio|video|iframe|script)\b/i);
    assert.match(html,/<strong>BizuLanguage<\/strong><\/p>$/);
    assert.doesNotMatch(JSON.stringify(l),/TODO:|Lorem ipsum|\[inserir/i);
   }
  }
 }
 assert.equal(count,64);assert.equal(course.lessonCount,177);
});
test('imported identical edition without meta markers is not duplicated',t=>{
 const lib=new Library();t.after(()=>lib.close());assert.equal(course.install(lib),177);
 lib.db.exec("DELETE FROM meta WHERE key IN ('bizulanguage_v1','bizulanguage_v2')");
 assert.equal(course.install(lib),0);assert.equal(lib.noteCount(),177);assert.equal(course.installed(lib),true);
});

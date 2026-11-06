'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {Library} = require('../src/core/library');
const storage = require('../src/core/storage');
const events = require('../src/core/events');
const dates = require('../src/core/dates');
const backups = require('../src/core/backups');
const taxonomy = require('../src/data/tec-folders.json');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'b9mm-validation-'));
  const db = new Library(path.join(dir,'biblioteca.db'));
  t.after(() => {
    db.close();
    // Only the unique test folder created above is removed.
    fs.rmSync(dir,{recursive:true,force:true});
  });
  return {dir,db};
}
test('empty libraries and corrected optional TEC paths', t => {
  const {db}=fixture(t);
  storage.extendSchema(db);
  assert.equal(db.listFolders().length,0);
  assert.equal(storage.seedTec(db,taxonomy),2165);
  const list=db.listFolders();
  const pathOf=name=>db.folderPath(list.find(f=>f.name===name).id);
  assert.equal(pathOf('Morfologia'),'Língua Portuguesa / Morfologia');
  assert.equal(pathOf('Uso do Hífen'),'Língua Portuguesa / Ortografia / Uso do Hífen');
  assert.doesNotMatch(pathOf('Legislação Profissional de Medicina (CFM e CRM)'),/Corretor/);
});
test('calendar validates local leap days, hours and edits', t => {
  const {db}=fixture(t);
  storage.extendSchema(db);
  assert.throws(()=>events.saveEvent(db.db,{title:'Prova',day:'2027-02-29'}),/data válida/);
  assert.throws(()=>events.saveEvent(db.db,{title:'Prova',day:'2028-02-29',time:'24:00'}),/horário válido/);
  const id=events.saveEvent(db.db,{title:'Prova',day:'2028-02-29'});
  events.saveEvent(db.db,{id,title:'Prova revisada',day:'2028-02-29',time:'09:30',note:'Documento'});
  assert.deepEqual({...events.listEvents(db.db)[0]},{id,title:'Prova revisada',day:'2028-02-29',time:'09:30',note:'Documento'});
  assert.equal(events.deleteEvent(db.db,id),true);
  assert.deepEqual(events.listEvents(db.db),[]);
});
test('next event uses local time, keeps all-day events and crosses years', () => {
  const all=[
    {id:1,title:'Passou',day:'2028-12-31',time:'08:00'},
    {id:2,title:'Hoje',day:'2028-12-31',time:''},
    {id:3,title:'Amanhã',day:'2029-01-01',time:''}
  ];
  const now=new Date(2028,11,31,20,0);
  assert.equal(dates.nextEvent(all,now).id,2);
  assert.equal(dates.nextEvent(all.filter(e=>e.id!==2),now).id,3);
  assert.equal(dates.nextEvent(all,new Date(2029,0,2)),null);
  assert.equal(dates.daysBetween('2028-12-31','2029-01-01'),1);
  assert.equal(dates.daysBetween('2028-02-28','2028-03-01'),2);
});
test('.b9mm round-trip preserves the calendar, old notes and attachments', t => {
  const src=fixture(t),dest=fixture(t);
  storage.extendSchema(src.db);storage.extendSchema(dest.db);
  const file='abcdef12.png';
  fs.mkdirSync(path.join(src.dir,'anexos'));
  fs.writeFileSync(path.join(src.dir,'anexos',file),Buffer.from([1,2,3]));
  src.db.createNote({title:'Foto',contentHtml:'<p><img src="tv-attachment://'+file+'"></p>'});
  events.saveEvent(src.db.db,{title:'Prova',day:'2028-02-29'});
  const manual=backups.writeBackup(src.db,src.dir);
  assert.equal(path.extname(manual),'.b9mm');
  const pack=storage.decodePackage(fs.readFileSync(manual));
  assert.equal(pack.images[0].name,file);
  const restored=path.join(src.dir,'restaurada.db');
  fs.writeFileSync(restored,pack.database);
  assert.equal(storage.validateDatabase(restored,pack.images),true);
  assert.throws(()=>storage.validateDatabase(restored,[]),/Imagem ausente/);
  const copy=new Library(restored);
  try {
    const prior=dest.db.createNote({title:'Anotação anterior'});
    assert.equal(storage.mergeLibraries(dest.db,copy).eventsInserted,1);
    assert.equal(storage.mergeLibraries(dest.db,copy).eventsDuplicates,1);
    assert.equal(events.listEvents(dest.db.db).length,1);
    assert.equal(dest.db.getNote(prior).title,'Anotação anterior');
  } finally {copy.close();}
});
test('backup failure leaves active notes intact and keeps a local copy if the external drive is absent',t=>{
  const {db,dir}=fixture(t);
  storage.extendSchema(db);
  const id=db.createNote({title:'Preservada'});
  assert.throws(()=>backups.writeBackup(db,dir,{additional:path.join(dir,'unidade-indisponivel')}));
  assert.equal(db.getNote(id).title,'Preservada');
  const files=fs.readdirSync(path.join(dir,'backups'));
  assert.equal(files.length,1);
  assert.ok(storage.decodePackage(fs.readFileSync(path.join(dir,'backups',files[0]))).database.length);
  assert.throws(()=>storage.atomicWrite(path.join(dir,'pasta-inexistente','arquivo'),'falha'));
  assert.equal(db.getNote(id).title,'Preservada');
});
test('retention leaves the new snapshot and all manual packages',t=>{
  const {db,dir}=fixture(t);
  storage.extendSchema(db);
  const local=path.join(dir,'backups');fs.mkdirSync(local);
  for(let d=1;d<=40;d++){
    const date=new Date(2028,1,d,14);
    fs.writeFileSync(path.join(local,backups.backupName(date,'auto')),'older');
  }
  const manual=backups.writeBackup(db,dir);
  const fresh=backups.writeBackup(db,dir,{automatic:true,now:new Date(2028,3,1,14)});
  assert.ok(fs.existsSync(fresh));assert.ok(fs.existsSync(manual));
  assert.ok(fs.readdirSync(local).filter(file=>file.startsWith('auto-')).length<=14);
});
test('large notebook indexes thousands of folders and notes',t=>{
  const {db}=fixture(t);
  const root=db.createFolder({name:'Matéria de teste'});
  db._tx(()=>{
    for(let i=0;i<2400;i++){
      const folderId=db.createFolder({name:'Tópico '+i,parentId:root});
      db.createNote({title:'Revisão '+i,folderId,contentHtml:'<p>Material de teste '+i+'</p>'});
    }
  });
  assert.equal(db.listFolders().length,2401);
  assert.equal(db.noteCount(),2400);
  assert.equal(require('../src/core/search').search(db,'"Revisão 2399"').results[0].title,'Revisão 2399');
});

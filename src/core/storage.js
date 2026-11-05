'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { Library } = require('./library');
const MAGIC = Buffer.from('BIZUTECA9MM1\n');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const safeName = n => typeof n === 'string' && /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,12}$/.test(n);
function atomicWrite(file, data) {
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  const fd = fs.openSync(temp, 'wx');
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(temp, file); } catch(e) { fs.rmSync(temp, {force:true}); throw e; }
}
function assertDirectory(dir) {
  fs.mkdirSync(dir, {recursive:true});
  const p = path.join(dir, '.bizuteca-write-' + crypto.randomUUID());
  fs.writeFileSync(p, 'ok', {flag:'wx'}); fs.unlinkSync(p);
}
function encodePackage(lib, dir) {
  lib.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const db = fs.readFileSync(path.join(dir, 'biblioteca.db'));
  const images = [];
  const assetDir = path.join(dir, 'anexos');
  if(fs.existsSync(assetDir)) for(const name of fs.readdirSync(assetDir)) {
    if(!safeName(name)) continue;
    const b=fs.readFileSync(path.join(assetDir,name)); images.push({name, data:b.toString('base64'),sha256:hash(b)});
  }
  for(const row of lib.db.prepare('SELECT content_html AS html FROM notes UNION ALL SELECT content_html AS html FROM note_versions').all()) {
    for(const m of String(row.html).matchAll(/tv-attachment:\/\/([a-f0-9-]+\.(?:png|jpe?g|gif|webp|bmp))/gi)) {
      if(!images.some(i=>i.name===m[1])) throw Error('Não foi possível incluir uma imagem do resumo: '+m[1]);
    }
  }
  return Buffer.concat([MAGIC,zlib.deflateSync(Buffer.from(JSON.stringify({format:'bizuteca-9mm',version:1,createdAt:new Date().toISOString(),database:db.toString('base64'),sha256:hash(db),images})))]);
}
function decodePackage(raw) {
  let doc;
  const old=Buffer.from('TVBACKUP1\n');
  if(raw.subarray(0,MAGIC.length).equals(MAGIC)) {
    doc=JSON.parse(zlib.inflateSync(raw.subarray(MAGIC.length),{maxOutputLength:512*1024*1024}).toString('utf8'));
    if(doc.format!=='bizuteca-9mm'||doc.version!==1)throw Error('Versão de biblioteca incompatível.');
  } else if(raw.subarray(0,old.length).equals(old)) {
    doc=JSON.parse(zlib.inflateSync(raw.subarray(old.length),{maxOutputLength:512*1024*1024}).toString('utf8'));
    if(doc.format!=='taticas-vagabundas-backup'||doc.version!==1)throw Error('Backup antigo inválido.');
  } else throw Error('Escolha um arquivo .bizuteca ou .tvbackup válido.');
  if(typeof doc.database!=='string'||!Array.isArray(doc.images)||doc.images.length>30000)throw Error('Pacote incompleto.');
  const database=Buffer.from(doc.database,'base64');
  if(database.subarray(0,16).toString('binary')!=='SQLite format 3\0')throw Error('Banco de dados inválido.');
  if(doc.sha256&&hash(database)!==doc.sha256)throw Error('O pacote está corrompido.');
  const names=new Set();
  const images=doc.images.map(i=>{if(!i||!safeName(i.name)||typeof i.data!=='string'||names.has(i.name))throw Error('Anexo inválido no pacote.');names.add(i.name);const bytes=Buffer.from(i.data,'base64');if(i.sha256&&hash(bytes)!==i.sha256)throw Error('Anexo corrompido: '+i.name);return {name:i.name,bytes};});
  return {database,images};
}
function seedTec(lib, data) {
  if(lib.db.prepare("SELECT value FROM meta WHERE key='bizuteca_tec_seed'").get())return 0;
  const keys=new Map();let count=0;
  lib._tx(()=>{
    for(const item of data){const parentId=item.parent==null?null:keys.get(item.parent);if(item.parent!=null&&!parentId)throw Error('Estrutura TEC: pasta principal ausente.');
      const found=lib.db.prepare('SELECT id FROM folders WHERE parent_id IS ? AND name=? AND deleted_at IS NULL').get(parentId,item.name);
      const id=found?found.id:lib.createFolder({name:item.name,parentId});if(!found)count++;keys.set(item.key,id);
    }
    lib.db.prepare("INSERT INTO meta(key,value) VALUES('bizuteca_tec_seed','1')").run();
  });return count;
}
function extendSchema(lib) {
  lib.db.exec(`CREATE TABLE IF NOT EXISTS biz_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS biz_files(id INTEGER PRIMARY KEY,note_id INTEGER NOT NULL,name TEXT NOT NULL,file TEXT NOT NULL,mime TEXT NOT NULL);`);
}
function validateDatabase(file) {
  const lib=new Library(file);try {const check=lib.db.prepare('PRAGMA integrity_check').get();if(Object.values(check)[0]!=='ok')throw Error('A integridade do banco não foi confirmada.');lib.listFolders();lib.listNotes({limit:1});return true;}finally{lib.close();}
}
function mergeLibraries(target, incoming) {
  const map=new Map();let inserted=0,duplicates=0;
  target._tx(()=>{
    let remaining=incoming.listFolders();let guard=0;
    while(remaining.length&&guard++<100){const next=[];for(const f of remaining){if(f.parentId!=null&&!map.has(f.parentId)){next.push(f);continue;}const parent=f.parentId==null?null:map.get(f.parentId);const found=target.db.prepare('SELECT id FROM folders WHERE parent_id IS ? AND name=? AND deleted_at IS NULL').get(parent,f.name);map.set(f.id,found?.id??target.createFolder({name:f.name,parentId:parent}));}if(next.length===remaining.length)throw Error('Pastas com hierarquia inválida.');remaining=next;}
    if(remaining.length)throw Error('Hierarquia extensa demais.');
    const notes=incoming.db.prepare('SELECT id FROM notes WHERE deleted_at IS NULL').all();const noteMap=new Map();
    for(const r of notes){const n=incoming.getNote(r.id),folder=n.folderId==null?null:map.get(n.folderId)??null;
      const same=target.db.prepare('SELECT id FROM notes WHERE folder_id IS ? AND title=? AND content_html=? AND deleted_at IS NULL').get(folder,n.title,n.contentHtml);
      if(same){duplicates++;noteMap.set(n.id,same.id);continue;}
      const id=target.createNote({title:n.title,contentHtml:n.contentHtml,folderId:folder,tags:n.tags,favorite:n.favorite});noteMap.set(n.id,id);if(n.archived)target.archiveNote(id,true);
      for(const v of incoming.listVersions(n.id)){const full=incoming.getVersion(v.id);target.db.prepare('INSERT INTO note_versions(note_id,title,content_html,saved_at) VALUES(?,?,?,?)').run(id,full.title,full.contentHtml,full.savedAt);}
      inserted++;
    }
    for(const s of incoming.listSynonyms())target.addSynonym(s.a,s.b);
    const table=incoming.db.prepare("SELECT name FROM sqlite_master WHERE name='biz_files'").get();
    if(table)for(const f of incoming.db.prepare('SELECT * FROM biz_files').all()){const nid=noteMap.get(f.note_id);if(nid&&!target.db.prepare('SELECT id FROM biz_files WHERE note_id=? AND file=?').get(nid,f.file))target.db.prepare('INSERT INTO biz_files(note_id,name,file,mime) VALUES(?,?,?,?)').run(nid,f.name,f.file,f.mime);}
  });return {inserted,duplicates};
}
module.exports={atomicWrite,assertDirectory,encodePackage,decodePackage,seedTec,extendSchema,validateDatabase,mergeLibraries,hash,safeName};

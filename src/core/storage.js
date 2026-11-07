'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const events = require('./events');
const MAGIC = Buffer.from('BIZUTECA9MM1\n');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const ALLOWED_EXTENSIONS=['pdf','png','jpg','jpeg','gif','webp','bmp','txt'];
const safeName = n => typeof n === 'string' && /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,12}$/.test(n)
  && ALLOWED_EXTENSIONS.includes(n.split('.').pop().toLowerCase())
  && !/^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])\./i.test(n);
function atomicWrite(file, data) {
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  const fd = fs.openSync(temp, 'wx');
  try {
    try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  } catch (error) { try { fs.unlinkSync(temp); } catch {} throw error; }
}
function assertDirectory(dir) {
  fs.mkdirSync(dir, {recursive:true});
  const p = path.join(dir, '.bizuteca-write-' + crypto.randomUUID());
  fs.writeFileSync(p, 'ok', {flag:'wx'}); fs.unlinkSync(p);
}
function encodePackage(lib, dir, onMissing) {
  const snapshot = path.join(os.tmpdir(), 'bizuteca-snapshot-' + crypto.randomUUID() + '.db');
  let db;
  try { lib.db.prepare('VACUUM INTO ?').run(snapshot); db = fs.readFileSync(snapshot); }
  finally { try { fs.unlinkSync(snapshot); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  const images = [];
  const assetDir = path.join(dir, 'anexos');
  if(fs.existsSync(assetDir)) for(const name of fs.readdirSync(assetDir)) {
    if(!safeName(name)) continue;
    const b=fs.readFileSync(path.join(assetDir,name)); images.push({name, data:b.toString('base64'),sha256:hash(b)});
  }
  const missing=validateAttachments(lib.db,new Set(images.map(image=>image.name)),true);
  if(missing.length)onMissing?.(missing);
  const payload = Buffer.from(JSON.stringify({format:'bizuteca-9mm',version:1,createdAt:new Date().toISOString(),database:db.toString('base64'),sha256:hash(db),images}));
  if (payload.length > 512 * 1024 * 1024) throw Error('A biblioteca excede o tamanho aceito para um pacote.');
  return Buffer.concat([MAGIC, zlib.deflateSync(payload)]);
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
  } else throw Error('Escolha um arquivo .b9mm, .bizuteca ou .tvbackup válido.');
  if(!doc||typeof doc.database!=='string'||!Array.isArray(doc.images)||doc.images.length>30000)throw Error('Pacote incompleto.');
  const database=Buffer.from(doc.database,'base64');
  if(database.subarray(0,16).toString('binary')!=='SQLite format 3\0')throw Error('Banco de dados inválido.');
  if(doc.sha256&&hash(database)!==doc.sha256)throw Error('O pacote está corrompido.');
  const names=new Set();
  const images=doc.images.map(i=>{if(!i||!safeName(i.name)||typeof i.data!=='string'||names.has(i.name.toLowerCase()))throw Error('Anexo inválido no pacote: '+String(i?.name??'sem nome'));names.add(i.name.toLowerCase());const bytes=Buffer.from(i.data,'base64');if(i.sha256&&hash(bytes)!==i.sha256)throw Error('Anexo corrompido: '+i.name);return {name:i.name,bytes};});
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
  events.ensureEvents(lib.db);
  lib.db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('biz_events_schema','1')").run();
}
function validateAttachments(db, available, allowMissing=false) {
  const missing=new Map();
  function check(file,title){
    if(!safeName(file))throw Error('Anexo inválido: '+file);
    if(available.has(file))return;
    if(!allowMissing)throw Error('Imagem ou anexo ausente no pacote: '+file);
    if(!missing.has(file))missing.set(file,new Set());
    missing.get(file).add(title);
  }
  const sources=db.prepare('SELECT title,content_html AS html FROM notes UNION ALL SELECT title,content_html AS html FROM note_versions').iterate();
  for(const {title,html} of sources){
    for(const match of String(html).matchAll(/tv-attachment:\/\/([a-f0-9-]+\.(?:png|jpe?g|gif|webp|bmp))/gi))check(match[1],title);
  }
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='biz_files'").get()){
    for(const {file,title} of db.prepare('SELECT f.file,COALESCE(n.title,\'Anotação ausente\') AS title FROM biz_files f LEFT JOIN notes n ON n.id=f.note_id').iterate())check(file,title);
  }
  return Array.from(missing,([file,titles])=>({file,titles:[...titles]}));
}
function validateDatabase(file, assets, onMissing) {
  const db = new DatabaseSync(file, {readOnly:true});
  try {
    db.exec('PRAGMA trusted_schema=OFF');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
    for (const table of ['meta','folders','notes','note_versions','notes_fts']) if (!tables.has(table)) throw Error('Banco incompatível: tabela ausente ' + table);
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' LIMIT 1").get()) throw Error('O pacote contém gatilhos SQLite não reconhecidos.');
    if (Object.values(db.prepare('PRAGMA integrity_check').get())[0] !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('A integridade do banco não foi confirmada.');
    const parents = new Map(db.prepare('SELECT id,parent_id FROM folders').all().map(row=>[row.id,row.parent_id]));
    for (const id of parents.keys()) {
      const seen = new Set();
      let cursor = id;
      while (cursor != null) {
        if (seen.has(cursor) || !parents.has(cursor) || seen.size >= 100) throw Error('Hierarquia de pastas inválida.');
        seen.add(cursor); cursor = parents.get(cursor);
      }
    }
    if(assets){
      const missing=validateAttachments(db,new Set(assets.map(asset=>asset.name)),Boolean(onMissing));
      if(missing.length)onMissing(missing);
    }
    return true;
  } finally { db.close(); }
}
function mergeLibraries(target, incoming) {
  const map=new Map();let inserted=0,duplicates=0,eventCounts={};
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
    eventCounts=events.mergeEvents(target.db,incoming.db);
  });
  return {inserted,duplicates,...eventCounts};
}
module.exports={atomicWrite,assertDirectory,encodePackage,decodePackage,seedTec,extendSchema,validateDatabase,mergeLibraries,hash,safeName,ALLOWED_EXTENSIONS};

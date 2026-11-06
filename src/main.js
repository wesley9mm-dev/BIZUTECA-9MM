'use strict';
const {app,BrowserWindow,ipcMain,dialog,protocol,clipboard,ClipboardItem,shell,nativeImage,screen}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const runtime=require('./core/runtime');
const portableBase=process.env.BIZUTECA_TEST_DATA||process.env.PORTABLE_EXECUTABLE_DIR||(app.isPackaged?path.dirname(app.getPath('exe')):path.resolve(__dirname,'..'));
const appData=app.getPath('appData');
const runtimePaths=runtime.configureRuntime(app,portableBase);
const {Library}=require('./core/library');
const {search}=require('./core/search');
const {consult}=require('./core/assistant');
const storage=require('./core/storage');
const {importTextFiles}=require('./core/text-import');
const events=require('./core/events');
const bizulanguage=require('./core/bizulanguage');
const backups=require('./core/backups');
const {DatabaseSync}=require('node:sqlite');
const {makeHtmlExport}=require('./core/export');
// Prioritize predictable rendering on older integrated GPUs and removable drives.
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'tv-attachment',privileges:{standard:true,secure:true,supportFetchAPI:true}},{scheme:'biz-file',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let win,lib,dir,pointer,base,closing=false,maintenance=false,lockPath,splash,backupTimer,backupChanges=0;
const test=process.env.BIZUTECA_TEST_DATA;
const allowed=new Set(['listFolders','createFolder','renameFolder','setFolderFavorite','moveFolder','reorderFolders','folderPath','deleteFolder','restoreFolder','purgeFolder','createNote','getNote','updateNote','moveNote','setNoteFavorite','archiveNote','duplicateNote','deleteNote','restoreNote','purgeNote','listTrash','emptyTrash','listNotes','listTags','listVersions','getVersion','restoreVersion','setTags','listSynonyms','addSynonym','removeSynonym']);
function lock(target){const file=path.join(target,'.bizuteca.lock');if(fs.existsSync(file)){let stale=false;try{const info=JSON.parse(fs.readFileSync(file,'utf8'));try{process.kill(info.pid,0);}catch(e){if(e.code==='ESRCH')stale=true;}}catch{}if(stale)fs.unlinkSync(file);else throw Error('Esta biblioteca já está aberta ou possui um bloqueio de outra sessão. Feche o outro programa antes de continuar.');}fs.writeFileSync(file,JSON.stringify({pid:process.pid}),{flag:'wx'});return file;}
function unlock(file){if(file)try{fs.unlinkSync(file);}catch{}}
function openLibrary(target) {
  storage.assertDirectory(target);
  const nextLock = lock(target);
  const file = path.join(target,'biblioteca.db');
  let next;
  try {
    const existing = fs.existsSync(file);
    if (existing) {
      const old = new DatabaseSync(file,{readOnly:true});
      try {
        const needsMigration = !old.prepare("SELECT value FROM meta WHERE key='biz_events_schema'").get();
        if (needsMigration) {
          storage.validateDatabase(file);
          backups.writeBackup({db:old}, target, {prefix:'antes-calendario'});
        }
      } finally { old.close(); }
    }
    next = new Library(file);
    next._tx(() => {
      storage.extendSchema(next);
      if (!existing) bizulanguage.install(next);
    });
    return {lib:next,lock:nextLock};
  } catch (error) { next?.close(); unlock(nextLock); throw error; }
}
function remember(target){const relative=path.relative(base,target);const value=!relative.startsWith('..')&&!path.isAbsolute(relative)?{relative:relative||'.'}:{absolute:target};storage.atomicWrite(pointer,JSON.stringify(value,null,2));}
function setting(k,value){if(value!==undefined){lib.db.prepare('INSERT INTO biz_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,JSON.stringify(value));return value;}const row=lib.db.prepare('SELECT value FROM biz_settings WHERE key=?').get(k);if(!row)return null;return JSON.parse(row.value);}
const backupName = () => backups.backupName();
function autoBackup(options={}) {
  return backups.writeBackup(lib,dir,options);
}
function trackBackup() {
  backupChanges = lib.db.prepare('SELECT total_changes() AS n').get().n;
}
function scheduledBackup() {
  if (!lib || maintenance || setting('automaticBackup') === false) return;
  const changes = lib.db.prepare('SELECT total_changes() AS n').get().n;
  if (changes === backupChanges) return;
  try {
    const local = autoBackup({automatic:true});
    backupChanges = changes;
    const additional = setting('backupDirectory');
    if (additional) {
      const name = path.basename(local);
      if (!fs.statSync(additional).isDirectory()) throw Error('A unidade de backup adicional está indisponível.');
      storage.atomicWrite(path.join(additional,name),fs.readFileSync(local));
    }
  } catch (error) {
    win?.webContents.send('backup-warning','Backup automático: '+error.message);
  }
}
async function chooseDir(){const result=await dialog.showOpenDialog(win,{title:'Escolher pasta de dados',properties:['openDirectory','createDirectory']});return result.canceled?null:result.filePaths[0];}
function copyAssets(images,target){const dest=path.join(target,'anexos');fs.mkdirSync(dest,{recursive:true});for(const image of images){const f=path.join(dest,image.name);if(fs.existsSync(f)){if(storage.hash(fs.readFileSync(f))!==storage.hash(image.bytes))throw Error('Já existe um anexo diferente com o mesmo nome. Use restauração em uma pasta separada.');}else storage.atomicWrite(f,image.bytes);}}
async function exportPackage(){const out=await dialog.showSaveDialog(win,{title:'Exportar biblioteca completa',defaultPath:backupName(),filters:[{name:'Biblioteca BIZUTECA (notas, pastas, versões e anexos)',extensions:['b9mm']}]});if(out.canceled)return null;storage.atomicWrite(out.filePath,storage.encodePackage(lib,dir));return out.filePath;}
async function importPackage(mode) {
  if (!['merge','replace'].includes(mode)) throw Error('Operação de importação inválida.');
  const picked = await dialog.showOpenDialog(win,{
    title:'Importar biblioteca',properties:['openFile'],
    filters:[{name:'Bibliotecas Bizuteca',extensions:['b9mm','bizuteca','tvbackup']}]
  });
  if (picked.canceled) return null;
  const file = picked.filePaths[0];
  if (fs.statSync(file).size > 512 * 1024 * 1024) throw Error('Pacote maior que 512 MB.');
  const pack = storage.decodePackage(fs.readFileSync(file));
  const temp = path.join(runtimePaths.sessionDirectory,'import-'+crypto.randomUUID()+'.db');
  let incoming;
  try {
    storage.atomicWrite(temp,pack.database);
    storage.validateDatabase(temp,pack.images);
    if (mode === 'replace') {
      const answer = await dialog.showMessageBox(win,{
        type:'warning',buttons:['Cancelar','Restaurar biblioteca'],defaultId:0,cancelId:0,
        message:'Abrir a biblioteca deste backup?',
        detail:'O conjunto restaurado será preparado em uma pasta separada. Sua biblioteca atual ficará disponível para recuperação.'
      });
      if (answer.response !== 1) return null;
      const safety = autoBackup();
      const staged = path.join(path.dirname(dir),'biblioteca-restaurada-'+crypto.randomUUID().slice(0,8));
      const staging = fs.mkdtempSync(path.join(path.dirname(dir),'.bizuteca-restauracao-'));
      copyAssets(pack.images,staging);
      storage.atomicWrite(path.join(staging,'biblioteca.db'),pack.database);
      storage.validateDatabase(path.join(staging,'biblioteca.db'),pack.images);
      fs.renameSync(staging,staged);
      const next = openLibrary(staged);
      try { remember(staged); }
      catch (error) { next.lib.close(); unlock(next.lock); throw error; }
      const previousDirectory = dir, previousLib = lib, previousLock = lockPath;
      lib = next.lib; lockPath = next.lock; dir = staged;
      trackBackup();
      try { previousLib.close(); } finally { unlock(previousLock); }
      return {restored:true,safety,previousDirectory,directory:dir};
    }
    incoming = new Library(temp);
    storage.extendSchema(incoming);
    const safety = autoBackup();
    // Install assets first, so no committed note can reference an unavailable file.
    const created = [];
    const destination = path.join(dir,'anexos');
    try {
      fs.mkdirSync(destination,{recursive:true});
      for (const asset of pack.images) {
        const dest = path.join(destination,asset.name);
        if (fs.existsSync(dest)) {
          if (storage.hash(fs.readFileSync(dest)) !== storage.hash(asset.bytes)) throw Error('Existe um anexo diferente com o mesmo nome: '+asset.name);
        } else { storage.atomicWrite(dest,asset.bytes); created.push(dest); }
      }
      return {...storage.mergeLibraries(lib,incoming),safety};
    } catch (error) {
      for (const dest of created) { try { fs.unlinkSync(dest); } catch {} }
      throw error;
    }
  } finally {
    incoming?.close();
    for (const suffix of ['','-wal','-shm']) { try { fs.unlinkSync(temp+suffix); } catch {} }
  }
}
async function changeData(mode){const target=await chooseDir();if(!target||path.resolve(target)===path.resolve(dir))return null;storage.assertDirectory(target);const exists=fs.existsSync(path.join(target,'biblioteca.db'));if(mode==='move'&&exists)throw Error('A pasta já contém uma biblioteca. Escolha “Abrir outra biblioteca” ou uma pasta vazia.');if(mode==='open'&&!exists)throw Error('Não há biblioteca.db nessa pasta. Use “Copiar biblioteca para outra pasta” para criar uma cópia.');
 if(mode==='move'){const pack=storage.decodePackage(storage.encodePackage(lib,dir));copyAssets(pack.images,target);storage.atomicWrite(path.join(target,'biblioteca.db'),pack.database);}
 const next=openLibrary(target);try{remember(target);}catch(e){next.lib.close();unlock(next.lock);throw e;}lib.close();unlock(lockPath);lib=next.lib;lockPath=next.lock;dir=target;trackBackup();return {directory:dir};}
async function exportMaterial(kind,ids){const notes=ids.map(id=>lib.getNote(Number(id))).filter(n=>n&&!n.deletedAt);if(!notes.length)throw Error('Selecione uma anotação.');const prepared=notes.map(n=>({...n,contentHtml:n.contentHtml.replace(/tv-attachment:\/\/([a-f0-9-]+\.(?:png|jpe?g|gif|webp|bmp))/gi,(_,name)=>{try{const mime=({'png':'png','jpg':'jpeg','jpeg':'jpeg','webp':'webp','gif':'gif','bmp':'bmp'})[name.split('.').pop()];return 'data:image/'+mime+';base64,'+fs.readFileSync(path.join(dir,'anexos',name)).toString('base64');}catch{return '';}})}));
 const out=await dialog.showSaveDialog(win,{title:'Exportar material',defaultPath:'meus-resumos.'+kind,filters:[{name:kind.toUpperCase(),extensions:[kind]}]});if(out.canceled)return null;
 const html=makeHtmlExport(prepared);
 if(kind==='html'){storage.atomicWrite(out.filePath,html);return out.filePath;}
 if(kind==='txt'){storage.atomicWrite(out.filePath,notes.map(n=>n.title+'\n\n'+n.contentText).join('\n\n----------------\n\n'));return out.filePath;}
 const printWin=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});try{await printWin.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));await printWin.webContents.executeJavaScript('Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{})))');const pdf=await printWin.webContents.printToPDF({pageSize:'A4',printBackground:true,preferCSSPageSize:true});storage.atomicWrite(out.filePath,pdf);return out.filePath;}finally{printWin.destroy();}
}
async function attach(noteId){if(!lib.getNote(Number(noteId)))throw Error('Anotação não encontrada.');const result=await dialog.showOpenDialog(win,{title:'Anexar PDF, imagem ou texto',properties:['openFile','multiSelections'],filters:[{name:'Materiais de estudo',extensions:['pdf','png','jpg','jpeg','webp','gif','txt']}]});if(result.canceled)return null;const assets=path.join(dir,'anexos');fs.mkdirSync(assets,{recursive:true});let count=0;
 for(const file of result.filePaths){if(fs.statSync(file).size>50*1024*1024)throw Error('Cada anexo pode ter até 50 MB.');const ext=path.extname(file).slice(1).toLowerCase();if(!/^(pdf|png|jpg|jpeg|gif|webp|txt)$/.test(ext))throw Error('Tipo de anexo não permitido.');const name=crypto.randomUUID()+'.'+ext;storage.atomicWrite(path.join(assets,name),fs.readFileSync(file));lib.db.prepare('INSERT INTO biz_files(note_id,name,file,mime) VALUES(?,?,?,?)').run(Number(noteId),path.basename(file),name,ext);count++;}return count;}
async function importText(folderId=null){
  const result=await dialog.showOpenDialog(win,{title:'Importar texto ou HTML como anotação',properties:['openFile','multiSelections'],filters:[{name:'Anotações',extensions:['txt','md','html','htm']}]});
  if(result.canceled)return null;
  const folder=folderId==null?null:lib.listFolders().find(item=>item.id===folderId);
  if(folderId!=null&&!folder)throw Error('A pasta de destino não está disponível.');
  const answer=await dialog.showMessageBox(win,{type:'question',title:'Confirmar importação',
    message:'Importar '+result.filePaths.length+' arquivo(s)?',
    detail:'Destino: '+(folder?lib.folderPath(folder.id):'Sem pasta'),
    buttons:['Cancelar','Importar'],defaultId:1,cancelId:0});
  if(answer.response!==1)return null;
  return importTextFiles(lib,result.filePaths,folderId);
}
function imageData(src) {
  if (typeof src !== 'string' || src.length > 28000000) throw Error('Imagem inválida ou muito grande.');
  const local = src.match(/^tv-attachment:\/\/([a-f0-9-]+\.(png|jpe?g|gif|webp|bmp))\/?$/i);
  if (local) return {bytes:fs.readFileSync(path.join(dir,'anexos',local[1])),ext:local[2].toLowerCase()};
  const embedded = src.match(/^data:image\/(png|jpeg|gif|webp|bmp);base64,([a-zA-Z0-9+/=]+)$/i);
  if (embedded) return {bytes:Buffer.from(embedded[2],'base64'),ext:embedded[1].toLowerCase()};
  throw Error('Selecione uma imagem local da anotação.');
}
async function useImage(kind, src) {
  const {bytes,ext} = imageData(src);
  if (kind === 'copy') {
    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty()) throw Error('O Windows não conseguiu decodificar esta imagem.');
    if (ClipboardItem) {
      const png = new Blob([image.toPNG()], {type:'image/png'});
      await clipboard.write([new ClipboardItem({'image/png':png})]);
    } else {
      clipboard.writeImage(image);
    }
    return true;
  }
  const {canceled,filePath} = await dialog.showSaveDialog(win,{
    title:'Salvar imagem como',defaultPath:'imagem.'+ext,filters:[{name:'Imagem '+ext.toUpperCase(),extensions:[ext]}]
  });
  if (canceled) return null;
  const output = path.extname(filePath).toLowerCase() === '.'+ext ? filePath : filePath+'.'+ext;
  storage.atomicWrite(output,bytes);
  return output;
}
async function action(op,args){
 if(allowed.has(op)){if(op==='purgeFolder'||op==='purgeNote'||op==='emptyTrash')autoBackup();return lib[op](...args);}
 switch(op){
 case 'init':return {directory:dir,version:app.getVersion(),settings:setting('preferences')||{},themes:setting('customThemes')||[],folderCount:lib.listFolders().length};
 case 'savePreferences':return setting('preferences',args[0]);
 case 'saveThemes':return setting('customThemes',args[0]);
 case 'search':return search(lib,String(args[0]||'').slice(0,12000),args[1]||{});
 case 'consult':return consult(lib,args[0]||{});
 case 'copy':await clipboard.writeText(String(args[0]||''));return true;
 case 'exportLibrary':return exportPackage();
 case 'backup':return autoBackup({additional:setting('backupDirectory')});
 case 'backupSettings':return {automatic:setting('automaticBackup')!==false,additional:setting('backupDirectory')};
 case 'toggleAutomaticBackup':return setting('automaticBackup',!!args[0]);
 case 'backupDirectory':{
   if (args[0] === 'clear') return setting('backupDirectory',null);
   const destination = await chooseDir();
   if (!destination) return null;
   if (path.resolve(destination)===path.resolve(dir,'backups')) throw Error('Escolha uma pasta diferente da cópia local.');
   storage.assertDirectory(destination);
   return setting('backupDirectory',destination);
 }
 case 'listEvents':return events.listEvents(lib.db);
 case 'saveEvent':return events.saveEvent(lib.db,args[0]);
 case 'deleteEvent':return events.deleteEvent(lib.db,args[0]);
 case 'applyBizuLanguage':{
   if (bizulanguage.installed(lib)) return 0;
   autoBackup();
   return bizulanguage.install(lib);
 }
 case 'applyTecModel':{
   autoBackup();
   return storage.seedTec(lib,require('./data/tec-folders.json'));
 }
 case 'snapshotNote':{
   const note=lib._raw(args[0]);
   if(!note||note.deleted_at)throw Error('Anotação inexistente.');
   lib._tx(()=>lib._snapshot(note,true));
   return true;
 }
 case 'copyImage':return useImage('copy',args[0]);
 case 'saveImageAs':return useImage('save',args[0]);
 case 'openReference':{
   const url = new URL(args[0]);
   if (!['https:','http:','mailto:'].includes(url.protocol) || url.username || url.password) throw Error('Endereço inválido.');
   await shell.openExternal(url.href);
   return true;
 }
 case 'importLibrary':return importPackage(args[0]);
 case 'changeData':return changeData(args[0]);
 case 'openData':return shell.openPath(dir);
 case 'exportMaterial':return exportMaterial(...args);
 case 'importText':return importText(args[0]);
 case 'attach':return attach(args[0]);
 case 'files':return lib.db.prepare('SELECT id,note_id AS noteId,name,file,mime FROM biz_files WHERE note_id=?').all(Number(args[0]));
 case 'openFile':{const f=lib.db.prepare('SELECT * FROM biz_files WHERE id=?').get(Number(args[0]));if(!f||!storage.safeName(f.file))throw Error('Anexo não encontrado.');return shell.openPath(path.join(dir,'anexos',f.file));}
 case 'deleteFile':lib.db.prepare('DELETE FROM biz_files WHERE id=?').run(Number(args[0]));return true;
 case 'saveImage':{const image=args[0];const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[image.mime];if(!ext||typeof image.data!=='string'||image.data.length>28000000)throw Error('Imagem inválida ou maior que 20 MB.');const folder=path.join(dir,'anexos');fs.mkdirSync(folder,{recursive:true});const name=crypto.randomUUID()+'.'+ext;storage.atomicWrite(path.join(folder,name),Buffer.from(image.data,'base64'));return 'tv-attachment://'+name;}
 case 'exportTheme':{const out=await dialog.showSaveDialog(win,{title:'Exportar tema',defaultPath:'tema-bizuteca.json',filters:[{name:'Tema JSON',extensions:['json']}]});if(out.canceled)return null;storage.atomicWrite(out.filePath,JSON.stringify(args[0],null,2));return out.filePath;}
 case 'importTheme':{const out=await dialog.showOpenDialog(win,{title:'Importar tema JSON',properties:['openFile'],filters:[{name:'Tema JSON',extensions:['json']}]});if(out.canceled)return null;if(fs.statSync(out.filePaths[0]).size>10*1024*1024)throw Error('Tema maior que 10 MB.');return JSON.parse(fs.readFileSync(out.filePaths[0],'utf8'));}
 case 'chooseBackground':{const result=await dialog.showOpenDialog(win,{title:'Imagem de fundo do tema',properties:['openFile'],filters:[{name:'Imagem',extensions:['png','jpg','jpeg','webp']}]});if(result.canceled)return null;const f=result.filePaths[0];if(fs.statSync(f).size>5*1024*1024)throw Error('Escolha uma imagem de até 5 MB.');const mime=/\.png$/i.test(f)?'png':/\.webp$/i.test(f)?'webp':'jpeg';return 'data:image/'+mime+';base64,'+fs.readFileSync(f).toString('base64');}
 default:throw Error('Operação não permitida.');
 }
}
app.whenReady().then(async()=>{
 const width=Math.min(850,screen.getPrimaryDisplay().workAreaSize.width-40,Math.floor((screen.getPrimaryDisplay().workAreaSize.height-40)*1.6));
 splash=new BrowserWindow({width,height:Math.round(width/1.6),frame:false,show:false,resizable:false,closable:false,backgroundColor:'#08130a',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 await splash.loadFile(path.join(__dirname,'renderer','splash.html'));
 splash.show();
 base=portableBase;
 pointer=runtime.configurationPath(base, test || appData, storage.assertDirectory);
 const saved=runtime.locateConfiguration(base,pointer);
 dir=test&&!saved?test:runtime.dataDirectory(base,saved);
 if(saved&&!fs.existsSync(path.join(dir,'biblioteca.db'))){
   splash.hide();
   const result=await dialog.showMessageBox({type:'warning',buttons:['Localizar biblioteca','Encerrar'],defaultId:0,cancelId:1,message:'A pasta de dados não foi encontrada.',detail:'Conecte o pendrive ou localize a pasta original. Nenhuma biblioteca vazia será criada.'});
   if(result.response!==0){app.quit();return;}
   const picked=await dialog.showOpenDialog({title:'Localizar pasta que contém biblioteca.db',properties:['openDirectory']});
   if(picked.canceled||!fs.existsSync(path.join(picked.filePaths[0],'biblioteca.db'))){app.quit();return;}
   dir=picked.filePaths[0];
 } else if(!saved && pointer!==path.join(runtime.supportDirectory(base),'config.json') && !fs.existsSync(path.join(dir,'biblioteca.db'))){
   const picked=await dialog.showOpenDialog({title:'Escolher pasta de dados do Bizuteca',properties:['openDirectory','createDirectory']});
   if(picked.canceled){app.quit();return;}
   const selected=picked.filePaths[0];
   const previous=runtime.locateConfiguration(selected);
   dir=fs.existsSync(path.join(selected,'biblioteca.db'))?selected:runtime.dataDirectory(selected,previous);
   if(previous&&!fs.existsSync(path.join(dir,'biblioteca.db')))throw Error('A pasta escolhida aponta para uma biblioteca que não foi encontrada.');
 }
 try{const opened=openLibrary(dir);lib=opened.lib;lockPath=opened.lock;remember(dir);trackBackup();}catch(e){dialog.showErrorBox('Não foi possível abrir o caderno',String(e.message));app.quit();return;}
 protocol.handle('tv-attachment',async req=>{const name=new URL(req.url).hostname;if(!/^[a-f0-9-]+\.(png|jpe?g|gif|webp|bmp)$/i.test(name))return new Response('',{status:404});try{const bytes=fs.readFileSync(path.join(dir,'anexos',name));const ext=name.split('.').pop();return new Response(bytes,{headers:{'Content-Type':'image/'+({jpg:'jpeg'}[ext]||ext),'X-Content-Type-Options':'nosniff'}});}catch{return new Response('',{status:404});}});
 win=new BrowserWindow({width:1550,height:940,minWidth:860,minHeight:570,show:false,backgroundColor:'#08170f',title:'BIZUTECA 9MM',icon:path.join(__dirname,'assets','bizuteca.ico'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}});win.setMenuBarVisibility(false);
 const html=path.join(__dirname,'renderer','index.html');const trusted=()=>win&&!win.isDestroyed();
 ipcMain.handle('biz',async(event,op,args=[])=>{if(!trusted()||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Origem inválida.');if(maintenance)throw Error('Aguarde a operação de dados em andamento.');const long=['importLibrary','changeData','exportLibrary','backup','applyTecModel','applyBizuLanguage','importText'];if(long.includes(op))maintenance=true;try{return await action(op,args);}finally{if(long.includes(op))maintenance=false;}});
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 win.webContents.session.setPermissionCheckHandler(()=>false);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.session.webRequest.onBeforeRequest((details,cb)=>cb({cancel:! /^(file:|data:|tv-attachment:|devtools:)/.test(details.url)}));
 win.on('close',e=>{if(!closing){e.preventDefault();win.webContents.send('prepare-close');}});ipcMain.on('ready-close',event=>{if(event.sender===win.webContents){closing=true;win.close();}});
 const display = (event,success) => {
   if (event && (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)) return;
   clearTimeout(startupTimeout);
   ipcMain.removeListener('renderer-ready',display);
   if (win.isDestroyed()) return;
   win.show();
   splash?.destroy(); splash = null;
   if (test && process.env.BIZUTECA_SMOKE === '1' && success) {
     storage.atomicWrite(path.join(dir,'smoke-ready.json'),JSON.stringify({version:app.getVersion(),notes:lib.noteCount()}));
     closing=true; app.quit();
   }
 };
 const startupTimeout = setTimeout(()=>{
   display();
   dialog.showErrorBox('Inicialização incompleta','O Bizuteca não confirmou que a interface estava pronta.');
 },20000);
 ipcMain.on('renderer-ready',display);
 await win.loadFile(html);
 backupTimer=setInterval(scheduledBackup,30*60*1000);
}).catch(e=>{dialog.showErrorBox('BIZUTECA 9MM',String(e.stack||e));app.quit();});
app.on('window-all-closed',()=>app.quit());app.on('will-quit',()=>{clearInterval(backupTimer);try{lib?.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');lib?.close();}catch{}unlock(lockPath);});

app.on('quit',()=>runtime.cleanupSession(runtimePaths.sessionDirectory));

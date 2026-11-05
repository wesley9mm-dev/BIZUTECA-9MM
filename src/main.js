'use strict';
const {app,BrowserWindow,ipcMain,dialog,protocol,clipboard,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const runtime=require('./core/runtime');
const portableBase=process.env.BIZUTECA_TEST_DATA||process.env.PORTABLE_EXECUTABLE_DIR||(app.isPackaged?path.dirname(app.getPath('exe')):path.resolve(__dirname,'..'));
const runtimePaths=runtime.configureRuntime(app,portableBase);
const {Library}=require('./core/library');
const {search}=require('./core/search');
const {consult}=require('./core/assistant');
const storage=require('./core/storage');
const {makeHtmlExport}=require('./core/export');
// Prioritize predictable rendering on older integrated GPUs and removable drives.
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'tv-attachment',privileges:{standard:true,secure:true,supportFetchAPI:true}},{scheme:'biz-file',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let win,lib,dir,pointer,base,closing=false,maintenance=false,lockPath;
const test=process.env.BIZUTECA_TEST_DATA;
const allowed=new Set(['listFolders','createFolder','renameFolder','setFolderFavorite','moveFolder','reorderFolders','folderPath','deleteFolder','restoreFolder','purgeFolder','createNote','getNote','updateNote','moveNote','setNoteFavorite','archiveNote','duplicateNote','deleteNote','restoreNote','purgeNote','listTrash','emptyTrash','listNotes','listTags','listVersions','getVersion','restoreVersion','setTags','listSynonyms','addSynonym','removeSynonym']);
function lock(target){const file=path.join(target,'.bizuteca.lock');if(fs.existsSync(file)){let stale=false;try{const info=JSON.parse(fs.readFileSync(file,'utf8'));try{process.kill(info.pid,0);}catch(e){if(e.code==='ESRCH')stale=true;}}catch{}if(stale)fs.unlinkSync(file);else throw Error('Esta biblioteca já está aberta ou possui um bloqueio de outra sessão. Feche o outro programa antes de continuar.');}fs.writeFileSync(file,JSON.stringify({pid:process.pid}),{flag:'wx'});return file;}
function unlock(file){if(file)try{fs.unlinkSync(file);}catch{}}
function openLibrary(target){storage.assertDirectory(target);const nextLock=lock(target);let next;try{next=new Library(path.join(target,'biblioteca.db'));storage.extendSchema(next);return {lib:next,lock:nextLock};}catch(e){next?.close();unlock(nextLock);throw e;}}
function remember(target){const relative=path.relative(base,target);const value=!relative.startsWith('..')&&!path.isAbsolute(relative)?{relative:relative||'.'}:{absolute:target};storage.atomicWrite(pointer,JSON.stringify(value,null,2));}
function setting(k,value){if(value!==undefined){lib.db.prepare('INSERT INTO biz_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,JSON.stringify(value));return value;}const row=lib.db.prepare('SELECT value FROM biz_settings WHERE key=?').get(k);if(!row)return null;return JSON.parse(row.value);}
function backupName(){return 'BIZUTECA-'+new Date().toISOString().replace(/[:.]/g,'-')+'.bizuteca';}
function autoBackup(){const dest=path.join(dir,'backups');fs.mkdirSync(dest,{recursive:true});const file=path.join(dest,backupName());storage.atomicWrite(file,storage.encodePackage(lib,dir));return file;}
async function chooseDir(){const result=await dialog.showOpenDialog(win,{title:'Escolher pasta de dados',properties:['openDirectory','createDirectory']});return result.canceled?null:result.filePaths[0];}
function copyAssets(images,target){const dest=path.join(target,'anexos');fs.mkdirSync(dest,{recursive:true});for(const image of images){const f=path.join(dest,image.name);if(fs.existsSync(f)){if(storage.hash(fs.readFileSync(f))!==storage.hash(image.bytes))throw Error('Já existe um anexo diferente com o mesmo nome. Use restauração em uma pasta separada.');}else storage.atomicWrite(f,image.bytes);}}
async function exportPackage(){const out=await dialog.showSaveDialog(win,{title:'Exportar biblioteca completa',defaultPath:backupName(),filters:[{name:'Biblioteca BIZUTECA (notas, pastas, versões e anexos)',extensions:['bizuteca']}]});if(out.canceled)return null;storage.atomicWrite(out.filePath,storage.encodePackage(lib,dir));return out.filePath;}
async function importPackage(mode){const result=await dialog.showOpenDialog(win,{title:'Importar biblioteca',properties:['openFile'],filters:[{name:'Bibliotecas BIZUTECA / backups do protótipo',extensions:['bizuteca','tvbackup']}]});if(result.canceled)return null;const file=result.filePaths[0];if(fs.statSync(file).size>512*1024*1024)throw Error('Pacote maior que 512 MB.');const pack=storage.decodePackage(fs.readFileSync(file));const temp=path.join(dir,'.import-'+crypto.randomUUID()+'.db');fs.writeFileSync(temp,pack.database);let incoming;try{storage.validateDatabase(temp);incoming=new Library(temp);storage.extendSchema(incoming);
 if(mode==='replace'){
  const answer=await dialog.showMessageBox(win,{type:'warning',buttons:['Cancelar','Restaurar biblioteca'],defaultId:0,cancelId:0,message:'Substituir a biblioteca atual pelo arquivo escolhido?',detail:'Uma cópia de segurança completa será criada antes. Use “Acrescentar materiais” para manter as duas bibliotecas juntas.'});if(answer.response!==1)return null;
  const safety=autoBackup();incoming.close();incoming=null;
  const staged=path.join(dir,'.restore-'+crypto.randomUUID());fs.mkdirSync(staged);copyAssets(pack.images,staged);
  lib.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');lib.close();lib=null;
  const oldDb=path.join(dir,'biblioteca-antes-'+Date.now()+'.db');fs.renameSync(path.join(dir,'biblioteca.db'),oldDb);
  try{storage.atomicWrite(path.join(dir,'biblioteca.db'),pack.database);const next=new Library(path.join(dir,'biblioteca.db'));storage.extendSchema(next);const oldAssets=path.join(dir,'anexos');if(fs.existsSync(oldAssets))fs.renameSync(oldAssets,path.join(dir,'anexos-antes-'+Date.now()));fs.renameSync(path.join(staged,'anexos'),oldAssets);lib=next;fs.rmdirSync(staged);}
  catch(e){try{lib?.close();}catch{}fs.rmSync(path.join(dir,'biblioteca.db'),{force:true});fs.renameSync(oldDb,path.join(dir,'biblioteca.db'));lib=new Library(path.join(dir,'biblioteca.db'));throw e;}
  return {restored:true,safety};
 }
 const safety=autoBackup();copyAssets(pack.images,dir);const counts=storage.mergeLibraries(lib,incoming);return {...counts,safety};
 }finally{incoming?.close();for(const suffix of ['','-wal','-shm'])try{fs.unlinkSync(temp+suffix);}catch{}}
}
async function changeData(mode){const target=await chooseDir();if(!target||path.resolve(target)===path.resolve(dir))return null;storage.assertDirectory(target);const exists=fs.existsSync(path.join(target,'biblioteca.db'));if(mode==='move'&&exists)throw Error('A pasta já contém uma biblioteca. Escolha “Abrir outra biblioteca” ou uma pasta vazia.');if(mode==='open'&&!exists)throw Error('Não há biblioteca.db nessa pasta. Use “Copiar biblioteca para outra pasta” para criar uma cópia.');
 if(mode==='move'){const pack=storage.decodePackage(storage.encodePackage(lib,dir));copyAssets(pack.images,target);storage.atomicWrite(path.join(target,'biblioteca.db'),pack.database);}
 const next=openLibrary(target);try{remember(target);}catch(e){next.lib.close();unlock(next.lock);throw e;}lib.close();unlock(lockPath);lib=next.lib;lockPath=next.lock;dir=target;return {directory:dir};}
async function exportMaterial(kind,ids){const notes=ids.map(id=>lib.getNote(Number(id))).filter(n=>n&&!n.deletedAt);if(!notes.length)throw Error('Selecione uma anotação.');const prepared=notes.map(n=>({...n,contentHtml:n.contentHtml.replace(/tv-attachment:\/\/([a-f0-9-]+\.(?:png|jpe?g|gif|webp|bmp))/gi,(_,name)=>{try{const mime=({'png':'png','jpg':'jpeg','jpeg':'jpeg','webp':'webp','gif':'gif','bmp':'bmp'})[name.split('.').pop()];return 'data:image/'+mime+';base64,'+fs.readFileSync(path.join(dir,'anexos',name)).toString('base64');}catch{return '';}})}));
 const out=await dialog.showSaveDialog(win,{title:'Exportar material',defaultPath:'meus-resumos.'+kind,filters:[{name:kind.toUpperCase(),extensions:[kind]}]});if(out.canceled)return null;
 const html=makeHtmlExport(prepared);
 if(kind==='html'){storage.atomicWrite(out.filePath,html);return out.filePath;}
 if(kind==='txt'){storage.atomicWrite(out.filePath,notes.map(n=>n.title+'\n\n'+n.contentText).join('\n\n----------------\n\n'));return out.filePath;}
 const printWin=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});try{await printWin.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));await printWin.webContents.executeJavaScript('Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{})))');const pdf=await printWin.webContents.printToPDF({pageSize:'A4',printBackground:true,preferCSSPageSize:true});storage.atomicWrite(out.filePath,pdf);return out.filePath;}finally{printWin.destroy();}
}
async function attach(noteId){if(!lib.getNote(Number(noteId)))throw Error('Anotação não encontrada.');const result=await dialog.showOpenDialog(win,{title:'Anexar PDF, imagem ou texto',properties:['openFile','multiSelections'],filters:[{name:'Materiais de estudo',extensions:['pdf','png','jpg','jpeg','webp','gif','txt']}]});if(result.canceled)return null;const assets=path.join(dir,'anexos');fs.mkdirSync(assets,{recursive:true});let count=0;
 for(const file of result.filePaths){if(fs.statSync(file).size>50*1024*1024)throw Error('Cada anexo pode ter até 50 MB.');const ext=path.extname(file).slice(1).toLowerCase();if(!/^(pdf|png|jpg|jpeg|gif|webp|txt)$/.test(ext))throw Error('Tipo de anexo não permitido.');const name=crypto.randomUUID()+'.'+ext;storage.atomicWrite(path.join(assets,name),fs.readFileSync(file));lib.db.prepare('INSERT INTO biz_files(note_id,name,file,mime) VALUES(?,?,?,?)').run(Number(noteId),path.basename(file),name,ext);count++;}return count;}
async function importText(){const result=await dialog.showOpenDialog(win,{title:'Importar texto ou HTML como anotação',properties:['openFile','multiSelections'],filters:[{name:'Anotações',extensions:['txt','md','html','htm']}]});if(result.canceled)return null;let count=0;for(const f of result.filePaths){if(fs.statSync(f).size>20*1024*1024)throw Error('Texto maior que 20 MB.');let html=fs.readFileSync(f,'utf8');if(!/\.html?$/i.test(f))html='<p>'+html.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(/\r?\n/g,'<br>')+'</p>';lib.createNote({title:path.basename(f,path.extname(f)),contentHtml:html});count++;}return count;}
async function action(op,args){
 if(allowed.has(op)){if(op==='purgeFolder'||op==='purgeNote'||op==='emptyTrash')autoBackup();return lib[op](...args);}
 switch(op){
 case 'init':return {directory:dir,version:app.getVersion(),settings:setting('preferences')||{},themes:setting('customThemes')||[],folderCount:lib.listFolders().length};
 case 'savePreferences':return setting('preferences',args[0]);
 case 'saveThemes':return setting('customThemes',args[0]);
 case 'search':return search(lib,String(args[0]||'').slice(0,12000),args[1]||{});
 case 'consult':return consult(lib,args[0]||{});
 case 'copy':clipboard.writeText(String(args[0]||''));return true;
 case 'exportLibrary':return exportPackage();
 case 'backup':return autoBackup();
 case 'importLibrary':return importPackage(args[0]);
 case 'changeData':return changeData(args[0]);
 case 'openData':return shell.openPath(dir);
 case 'exportMaterial':return exportMaterial(...args);
 case 'importText':return importText();
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
 base=process.env.PORTABLE_EXECUTABLE_DIR||(app.isPackaged?path.dirname(app.getPath('exe')):path.resolve(__dirname,'..'));if(test)base=test;
 pointer=path.join(runtime.supportDirectory(base),'config.json');const saved=runtime.locateConfiguration(base);
 dir=test||runtime.dataDirectory(base,saved);
 if(saved&&!fs.existsSync(path.join(dir,'biblioteca.db'))){const result=await dialog.showMessageBox({type:'warning',buttons:['Localizar biblioteca','Encerrar'],defaultId:0,cancelId:1,message:'A pasta de dados não foi encontrada.',detail:'Conecte o pendrive ou localize a pasta original. Nenhuma biblioteca vazia será criada.'});if(result.response!==0){app.quit();return;}const picked=await dialog.showOpenDialog({title:'Localizar pasta que contém biblioteca.db',properties:['openDirectory']});if(picked.canceled||!fs.existsSync(path.join(picked.filePaths[0],'biblioteca.db'))){app.quit();return;}dir=picked.filePaths[0];}
 try{storage.assertDirectory(base);}catch{const picked=await dialog.showOpenDialog({title:'Escolher uma pasta gravável para configuração e dados',properties:['openDirectory','createDirectory']});if(picked.canceled){app.quit();return;}base=picked.filePaths[0];fs.mkdirSync(runtime.supportDirectory(base),{recursive:true});pointer=path.join(runtime.supportDirectory(base),'config.json');dir=runtime.dataDirectory(base,null);}
 try{const opened=openLibrary(dir);lib=opened.lib;lockPath=opened.lock;remember(dir);storage.seedTec(lib,require('./data/tec-folders.json'));}catch(e){dialog.showErrorBox('Não foi possível abrir o caderno',String(e.message));app.quit();return;}
 protocol.handle('tv-attachment',async req=>{const name=new URL(req.url).hostname;if(!/^[a-f0-9-]+\.(png|jpe?g|gif|webp|bmp)$/i.test(name))return new Response('',{status:404});try{const bytes=fs.readFileSync(path.join(dir,'anexos',name));const ext=name.split('.').pop();return new Response(bytes,{headers:{'Content-Type':'image/'+({jpg:'jpeg'}[ext]||ext),'X-Content-Type-Options':'nosniff'}});}catch{return new Response('',{status:404});}});
 win=new BrowserWindow({width:1550,height:940,minWidth:1040,minHeight:680,backgroundColor:'#08170f',title:'BIZUTECA 9MM',icon:path.join(__dirname,'assets','bizuteca.ico'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}});win.setMenuBarVisibility(false);
 const html=path.join(__dirname,'renderer','index.html');const trusted=()=>win&&!win.isDestroyed();
 ipcMain.handle('biz',async(event,op,args=[])=>{if(!trusted()||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Origem inválida.');if(maintenance)throw Error('Aguarde a operação de dados em andamento.');const long=['importLibrary','changeData','exportLibrary','backup'];if(long.includes(op))maintenance=true;try{return await action(op,args);}finally{if(long.includes(op))maintenance=false;}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.session.webRequest.onBeforeRequest((details,cb)=>cb({cancel:! /^(file:|data:|tv-attachment:|devtools:)/.test(details.url)}));
 win.on('close',e=>{if(!closing){e.preventDefault();win.webContents.send('prepare-close');}});ipcMain.on('ready-close',event=>{if(event.sender===win.webContents){closing=true;win.close();}});
 await win.loadFile(html);
}).catch(e=>{dialog.showErrorBox('BIZUTECA 9MM',String(e.stack||e));app.quit();});
app.on('window-all-closed',()=>app.quit());app.on('will-quit',()=>{try{lib?.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');lib?.close();}catch{}unlock(lockPath);});

app.on('quit',()=>runtime.cleanupSession(runtimePaths.sessionDirectory));

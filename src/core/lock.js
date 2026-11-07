'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const host=os.hostname().toLowerCase();

function read(file){
 try{return {raw:fs.readFileSync(file,'utf8'),mtime:fs.statSync(file).mtimeMs};}
 catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function status(snapshot){
 if(!snapshot)return 'free';
 let owner;
 try{owner=JSON.parse(snapshot.raw);}catch{return 'unknown';}
 if(owner?.host!==host||!Number.isSafeInteger(owner.pid)||owner.pid<=0)return 'unknown';
 if(Math.max(snapshot.mtime,Number(owner.start)||0)<Date.now()-os.uptime()*1000-5000)return 'stale';
 try{process.kill(owner.pid,0);return 'live';}
 catch(error){return error.code==='ESRCH'?'stale':'unknown';}
}
function blocked(file,snapshot,state){
 const error=Error('Esta biblioteca já está aberta ou possui um bloqueio de outra sessão.');
 error.code='BIZ_LOCKED';
 error.recovery={file,snapshot,canRemove:state==='unknown'&&Boolean(snapshot)};
 return error;
}
function removeObserved(file,expected,force=false){
 const guard=file+'.recuperacao';
 let fd;
 try{fd=fs.openSync(guard,'wx');}
 catch(error){if(error.code==='EEXIST')return false;throw error;}
 try{
  const current=read(file),state=status(current);
  if(!current||current.raw!==expected?.raw||current.mtime!==expected.mtime)return false;
  if(state!=='stale'&&!(force&&state==='unknown'))return false;
  fs.unlinkSync(file);
  return true;
 }finally{fs.closeSync(fd);fs.unlinkSync(guard);}
}
function lock(directory){
 const file=path.join(directory,'.bizuteca.lock');
 const raw=JSON.stringify({pid:process.pid,host,start:Date.now(),token:randomUUID()});
 for(let attempt=0;attempt<3;attempt++){
  try{fs.writeFileSync(file,raw,{flag:'wx'});return {file,raw};}
  catch(error){if(error.code!=='EEXIST')throw error;}
  const snapshot=read(file),state=status(snapshot);
  if(state==='free'||(state==='stale'&&removeObserved(file,snapshot)))continue;
  throw blocked(file,snapshot,state);
 }
 throw blocked(file,null,'unknown');
}
function unlock(owner){
 if(!owner)return;
 try{if(read(owner.file)?.raw===owner.raw)fs.unlinkSync(owner.file);}
 catch(error){if(error.code!=='ENOENT')console.warn('Não foi possível liberar o bloqueio: '+error.message);}
}
function recover(recovery){
 return recovery?.canRemove&&removeObserved(recovery.file,recovery.snapshot,true);
}
module.exports={lock,unlock,recover};

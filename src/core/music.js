'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {Readable}=require('node:stream');
const {createHash}=require('node:crypto');

const folder=directory=>path.join(directory,'musicas');
const isTrack=name=>!name.includes(':')&&name===path.win32.basename(name)&&name===path.posix.basename(name)&&/\.mp3$/i.test(name);
function listFiles(directory){
  try{
    return fs.readdirSync(directory,{withFileTypes:true})
      .filter(entry=>entry.isFile()&&isTrack(entry.name))
      .map(entry=>entry.name);
  }catch(error){
    if(error.code==='ENOENT')return [];
    throw error;
  }
}
function list(directory,bundled){
  return [...new Set([...listFiles(folder(directory)),...(bundled?listFiles(bundled):[])])]
    .sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
async function digest(file){
  const hash=createHash('sha256');
  for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}
async function add(directory,sources,onConflict){
  const target=folder(directory);
  await fs.promises.mkdir(target,{recursive:true});
  for(const source of sources){
    const name=path.basename(source);
    if(!isTrack(name))continue;
    const dest=path.join(target,name);
    try{await fs.promises.copyFile(source,dest,fs.constants.COPYFILE_EXCL);}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      const stat=await fs.promises.lstat(dest);
      if(!stat.isFile()||stat.size!==(await fs.promises.stat(source)).size||await digest(dest)!==await digest(source))onConflict?.(name);
    }
  }
  return list(directory);
}
async function response(directory,request,bundled){
  const url=new URL(request.url);
  const name=decodeURIComponent(url.pathname.slice(1));
  if(url.hostname!=='local'||!isTrack(name))return new Response(null,{status:404});
  let file=path.join(folder(directory),name);
  let stat=await fs.promises.lstat(file).catch(()=>null);
  if(!stat?.isFile()&&bundled){
    file=path.join(bundled,name);
    stat=await fs.promises.lstat(file).catch(()=>null);
  }
  if(!stat?.isFile()||!stat.size)return new Response(null,{status:404});
  const headers={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
  const range=request.headers.get('range');
  let start=0,end=stat.size-1;
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(match&&(match[1]||match[2])){
      if(match[1]){
        start=Number(match[1]);
        if(match[2])end=Math.min(end,Number(match[2]));
      }else start=Math.max(0,stat.size-Number(match[2]));
    }else start=stat.size;
    if(start>end||start>=stat.size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+stat.size}});
    headers['Content-Range']='bytes '+start+'-'+end+'/'+stat.size;
  }
  headers['Content-Length']=String(end-start+1);
  const stream=request.method==='HEAD'?null:Readable.toWeb(fs.createReadStream(file,{start,end}));
  return new Response(stream,{status:range?206:200,headers});
}
function copyLibrary(source,target,onConflict){
  return add(target,listFiles(folder(source)).map(name=>path.join(folder(source),name)),onConflict);
}
module.exports={list,add,copyLibrary,response};

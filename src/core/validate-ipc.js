'use strict';
const id=value=>Number.isSafeInteger(value)&&value>0;
const nullableId=value=>value==null||id(value);
const text=max=>value=>typeof value==='string'&&value.length<=max;
const bool=value=>typeof value==='boolean';
const ids=value=>Array.isArray(value)&&value.length<=10000&&value.every(id);
const tags=value=>Array.isArray(value)&&value.length<=1000&&value.every(text(500));
const record=(value,fields)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.entries(value).every(([key,val])=>Object.hasOwn(fields,key)&&fields[key](val));
const noteFields={title:text(500),contentHtml:text(32*1024*1024),folderId:nullableId,tags,favorite:bool};
const queryFields={folderId:nullableId,archived:bool,favorites:bool,tag:text(500),orderBy:v=>v==='title'||v==='updated',limit:v=>id(v)&&v<=100000};
const optional=rule=>value=>value===undefined||rule(value);
const rules=new Map();
function assign(names,...checks){for(const name of names.split(' '))rules.set(name,checks);}
assign('listFolders listTrash emptyTrash listTags listSynonyms');
assign('folderPath',nullableId);
assign('deleteFolder restoreFolder purgeFolder getNote duplicateNote deleteNote restoreNote purgeNote listVersions getVersion restoreVersion',id);
assign('moveFolder moveNote',id,nullableId);
assign('setFolderFavorite setNoteFavorite',id,bool);
assign('archiveNote',id,optional(bool));
assign('renameFolder',id,text(220));
assign('reorderFolders',nullableId,ids);
assign('setTags',id,tags);
assign('addSynonym removeSynonym',text(500),text(500));
assign('createFolder',v=>record(v,{name:text(220),parentId:nullableId})&&typeof v.name==='string');
assign('createNote',optional(v=>record(v,noteFields)));
assign('updateNote',id,optional(v=>record(v,{...noteFields,archived:bool})));
assign('listNotes',optional(v=>record(v,queryFields)));
function validateLibraryCall(op,args){
 const checks=rules.get(op);
 if(!checks||!Array.isArray(args)||args.length>checks.length||!checks.every((check,i)=>check(args[i])))throw Error('Argumentos inválidos para a operação de biblioteca.');
}
function validateExport(kind,selection){
 if(!['pdf','html','txt'].includes(kind))throw Error('Formato de exportação inválido.');
 if(!ids(selection)||!selection.length)throw Error('Selecione entre 1 e 10.000 anotações válidas para exportar.');
}
module.exports={validateLibraryCall,validateExport};

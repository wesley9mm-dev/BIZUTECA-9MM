'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('biz',{
 call:(op,...args)=>ipcRenderer.invoke('biz',op,args),
 onClose:fn=>ipcRenderer.on('prepare-close',()=>fn()),
 onBackupWarning:fn=>ipcRenderer.on('backup-warning',(_event,message)=>fn(message)),
 readyToShow:success=>ipcRenderer.send('renderer-ready',success===true),
 readyToClose:()=>ipcRenderer.send('ready-close')
});

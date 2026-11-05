'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('biz',{
 call:(op,...args)=>ipcRenderer.invoke('biz',op,args),
 onClose:fn=>ipcRenderer.on('prepare-close',()=>fn()),
 readyToClose:()=>ipcRenderer.send('ready-close')
});

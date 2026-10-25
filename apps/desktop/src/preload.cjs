'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ninhvana', {
  getServer: () => ipcRenderer.invoke('server:get'),
  setServer: (url) => ipcRenderer.invoke('server:set', url),
  defaultServer: () => ipcRenderer.invoke('server:default'),
});

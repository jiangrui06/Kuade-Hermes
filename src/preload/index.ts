import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge, RuntimeEvent } from '../shared/contracts';
const bridge: DesktopBridge = {
  status: () => ipcRenderer.invoke('kuade:status'),
  restart: () => ipcRenderer.invoke('kuade:restart'),
  chooseDirectory: () => ipcRenderer.invoke('kuade:directory'),
  call: (endpoint, args) => ipcRenderer.invoke('kuade:call', endpoint, args),
  subscribe: (id, endpoint, args) => ipcRenderer.invoke('kuade:subscribe', id, endpoint, args),
  unsubscribe: id => ipcRenderer.invoke('kuade:unsubscribe', id),
  onEvent: listener => {
    const handler = (_event: Electron.IpcRendererEvent, event: RuntimeEvent) => listener(event);
    ipcRenderer.on('kuade:event', handler);
    return () => ipcRenderer.removeListener('kuade:event', handler);
  },
  window: action => ipcRenderer.send('kuade:window', action),
};
contextBridge.exposeInMainWorld('kuade', bridge);

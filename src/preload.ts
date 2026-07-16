import { contextBridge, ipcRenderer } from 'electron';
import type { PerchanceStatus, PromptLoomApi } from './shared/types';

const api: PromptLoomApi = {
  listCategories: () => ipcRenderer.invoke('categories:list'),
  createCategory: (name) => ipcRenderer.invoke('categories:create', name),
  renameCategory: (id, name) => ipcRenderer.invoke('categories:rename', id, name),
  deleteCategory: (id) => ipcRenderer.invoke('categories:delete', id),

  listItems: () => ipcRenderer.invoke('items:list'),
  createItem: (categoryId, name, promptFragment) =>
    ipcRenderer.invoke('items:create', categoryId, name, promptFragment),
  updateItem: (id, name, promptFragment) =>
    ipcRenderer.invoke('items:update', id, name, promptFragment),
  deleteItem: (id) => ipcRenderer.invoke('items:delete', id),

  listGenerations: () => ipcRenderer.invoke('generations:list'),
  saveGeneration: (batchLabel, promptText, selection, seed, imageDataUrl) =>
    ipcRenderer.invoke('generations:save', batchLabel, promptText, selection, seed, imageDataUrl),
  deleteGeneration: (id) => ipcRenderer.invoke('generations:delete', id),
  deleteBatch: (batchLabel) => ipcRenderer.invoke('generations:deleteBatch', batchLabel),
  saveGenerationAs: (id) => ipcRenderer.invoke('generations:saveAs', id),

  generateImage: (promptText) => ipcRenderer.invoke('driver:generateImage', promptText),
  onPerchanceStatus: (callback) => {
    // The view may have already fired its first load event before this
    // subscribes — fetch the cached status once up front so that event
    // isn't missed, then keep listening for future updates.
    ipcRenderer.invoke('perchance:getStatus').then(callback);

    const listener = (_event: Electron.IpcRendererEvent, status: PerchanceStatus) =>
      callback(status);
    ipcRenderer.on('perchance:status', listener);
    return () => ipcRenderer.removeListener('perchance:status', listener);
  },
};

contextBridge.exposeInMainWorld('promptloom', api);

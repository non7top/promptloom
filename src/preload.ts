import { contextBridge, ipcRenderer } from 'electron';
import type { Generation, PerchanceStatus, PromptLoomApi } from './shared/types';

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
  exportDefinitions: () => ipcRenderer.invoke('definitions:export'),
  importDefinitions: () => ipcRenderer.invoke('definitions:import'),

  listGenerations: () => ipcRenderer.invoke('generations:list'),
  saveGeneration: (batchLabel, promptText, selection, seed, imageDataUrl) =>
    ipcRenderer.invoke('generations:save', batchLabel, promptText, selection, seed, imageDataUrl),
  deleteGeneration: (id) => ipcRenderer.invoke('generations:delete', id),
  deleteBatch: (batchLabel) => ipcRenderer.invoke('generations:deleteBatch', batchLabel),
  renameBatch: (oldLabel, newLabel) =>
    ipcRenderer.invoke('generations:renameBatch', oldLabel, newLabel),
  saveGenerationAs: (id) => ipcRenderer.invoke('generations:saveAs', id),

  populatePrompt: (promptText) => ipcRenderer.invoke('driver:populatePrompt', promptText),
  getCurrentStash: () => ipcRenderer.invoke('stash:getCurrent'),
  setCurrentStash: (name) => ipcRenderer.invoke('stash:setCurrent', name),
  setPerchanceHidden: (hidden) => ipcRenderer.invoke('perchance:setHidden', hidden),
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
  onGenerationSaved: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, generation: Generation) =>
      callback(generation);
    ipcRenderer.on('generations:saved', listener);
    return () => ipcRenderer.removeListener('generations:saved', listener);
  },
};

contextBridge.exposeInMainWorld('promptloom', api);

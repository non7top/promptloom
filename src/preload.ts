import { contextBridge, ipcRenderer } from 'electron';
import type { PromptLoomApi } from './shared/types';

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
  saveGeneration: (promptText, selection, seed, imageDataUrl) =>
    ipcRenderer.invoke('generations:save', promptText, selection, seed, imageDataUrl),
  deleteGeneration: (id) => ipcRenderer.invoke('generations:delete', id),
};

contextBridge.exposeInMainWorld('promptloom', api);

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
};

contextBridge.exposeInMainWorld('promptloom', api);

import { ipcMain } from 'electron';
import * as db from './db';

export function registerIpcHandlers(): void {
  ipcMain.handle('categories:list', () => db.listCategories());
  ipcMain.handle('categories:create', (_event, name: string) => db.createCategory(name));
  ipcMain.handle('categories:rename', (_event, id: number, name: string) =>
    db.renameCategory(id, name),
  );
  ipcMain.handle('categories:delete', (_event, id: number) => db.deleteCategory(id));

  ipcMain.handle('items:list', () => db.listItems());
  ipcMain.handle(
    'items:create',
    (_event, categoryId: number, name: string, promptFragment: string) =>
      db.createItem(categoryId, name, promptFragment),
  );
  ipcMain.handle('items:update', (_event, id: number, name: string, promptFragment: string) =>
    db.updateItem(id, name, promptFragment),
  );
  ipcMain.handle('items:delete', (_event, id: number) => db.deleteItem(id));
}

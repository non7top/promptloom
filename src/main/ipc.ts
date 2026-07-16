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

  ipcMain.handle('generations:list', () => db.listGenerations());
  ipcMain.handle(
    'generations:save',
    (
      _event,
      batchLabel: string,
      promptText: string,
      selection: Record<number, number>,
      seed: string | null,
      imageDataUrl: string,
    ) => db.saveGeneration(batchLabel, promptText, selection, seed, imageDataUrl),
  );
  ipcMain.handle('generations:delete', (_event, id: number) => db.deleteGeneration(id));
  ipcMain.handle('generations:deleteBatch', (_event, batchLabel: string) =>
    db.deleteBatch(batchLabel),
  );
}

import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import * as db from './db';
import { populatePrompt } from './perchanceDriver';
import { getLastPerchanceStatus, setPerchanceViewHidden } from './perchanceView';

let currentStash = 'Unsorted';

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
  ipcMain.handle('generations:renameBatch', (_event, oldLabel: string, newLabel: string) =>
    db.renameBatch(oldLabel, newLabel),
  );

  ipcMain.handle('generations:saveAs', async (_event, id: number) => {
    const generation = db.getGeneration(id);
    if (!generation) return null;

    const saveOptions = {
      defaultPath: path.basename(generation.imagePath),
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    };
    const window = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = window
      ? await dialog.showSaveDialog(window, saveOptions)
      : await dialog.showSaveDialog(saveOptions);
    if (canceled || !filePath) return null;

    fs.copyFileSync(generation.imagePath, filePath);
    const txtPath = filePath.replace(/\.png$/i, '') + '.txt';
    fs.writeFileSync(txtPath, db.sidecarText(generation.promptText, generation.seed));
    return filePath;
  });

  ipcMain.handle('driver:populatePrompt', (_event, promptText: string) =>
    populatePrompt(promptText),
  );

  ipcMain.handle('perchance:getStatus', () => getLastPerchanceStatus());

  ipcMain.handle('perchance:setHidden', (_event, hidden: boolean) =>
    setPerchanceViewHidden(hidden),
  );

  ipcMain.handle('stash:setCurrent', (_event, name: string) => {
    currentStash = name;
  });

  // Fire-and-forget from perchance's own save button, wrapped by
  // perchanceDriver.ts (via perchancePreload.ts's bridge) — not a
  // request/response, so `.on` rather than `.handle`. The image data and
  // its prompt/seed are read from the page itself, not tracked by us,
  // since a manually-saved image might not correspond to whatever we last
  // populated (the user may have tweaked the prompt, or be saving an
  // older result from the page's own history).
  ipcMain.on(
    'perchance:saveImage',
    (_event, imageDataUrl: string, prompt: string, seed: string | null) => {
      db.saveGeneration(currentStash, prompt || '(prompt unavailable)', {}, seed, imageDataUrl);
    },
  );
}

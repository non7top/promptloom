import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as db from './db';
import { populatePrompt } from './perchanceDriver';
import { getLastPerchanceStatus, setPerchanceViewHidden } from './perchanceView';
import { getDefaultLibraryPath, loadSettings, setLibraryPath } from './settings';
import { migrateLibrary, planMigration, rollbackMigration } from './storage';
import type { GalleryExportResult, GalleryImportResult } from '../shared/types';

// Triggered from the native app menu (main.ts), not a renderer button —
// exported as plain functions rather than folded into registerIpcHandlers
// below, since there's no IPC round-trip to wire up for a menu click.
export async function exportGalleryViaDialog(
  window: BrowserWindow | null,
): Promise<GalleryExportResult | null> {
  const saveOptions = {
    defaultPath: `promptloom-gallery-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
  };
  const { canceled, filePath } = window
    ? await dialog.showSaveDialog(window, saveOptions)
    : await dialog.showSaveDialog(saveOptions);
  if (canceled || !filePath) return null;

  const count = db.exportGalleryZip(filePath);
  return { filePath, count };
}

export async function importGalleryViaDialog(
  window: BrowserWindow | null,
): Promise<GalleryImportResult | null> {
  const openOptions: Electron.OpenDialogOptions = {
    filters: [{ name: 'Zip Archive', extensions: ['zip'] }],
    properties: ['openFile'],
  };
  const { canceled, filePaths } = window
    ? await dialog.showOpenDialog(window, openOptions)
    : await dialog.showOpenDialog(openOptions);
  if (canceled || filePaths.length === 0) return null;

  return db.importGalleryZip(filePaths[0]);
}

// Whatever a perchance-side save lands in before Composer's own start()
// ever sets a real stash name — today's date rather than a generic bucket,
// same fallback Composer.tsx uses when its own name field is left blank.
let currentStash = new Date().toISOString().slice(0, 10);

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

  ipcMain.handle('definitions:export', async () => {
    const saveOptions = {
      defaultPath: 'promptloom-definitions.txt',
      filters: [{ name: 'Text', extensions: ['txt'] }],
    };
    const window = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = window
      ? await dialog.showSaveDialog(window, saveOptions)
      : await dialog.showSaveDialog(saveOptions);
    if (canceled || !filePath) return null;

    fs.writeFileSync(filePath, db.exportDefinitionsText());
    return filePath;
  });

  ipcMain.handle('definitions:import', async () => {
    const openOptions: Electron.OpenDialogOptions = {
      filters: [{ name: 'Text', extensions: ['txt'] }],
      properties: ['openFile'],
    };
    const window = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = window
      ? await dialog.showOpenDialog(window, openOptions)
      : await dialog.showOpenDialog(openOptions);
    if (canceled || filePaths.length === 0) return null;

    return db.importDefinitionsText(fs.readFileSync(filePaths[0], 'utf-8'));
  });

  // --- Library / storage maintenance -------------------------------------
  // All of these are driven from the Settings tab rather than the native
  // menu: they're about the library as a whole, and a user who has just
  // pointed the app at a different folder needs them in the same place they
  // did the pointing.
  ipcMain.handle('library:info', () => {
    const settings = loadSettings();
    return db.libraryStats(getDefaultLibraryPath(), settings.recent);
  });

  ipcMain.handle('library:choose', async () => {
    const window = BrowserWindow.getAllWindows()[0] ?? null;
    const openOptions = {
      title: 'Choose a PromptLoom library folder',
      properties: ['openDirectory' as const, 'createDirectory' as const],
    };
    const { canceled, filePaths } = window
      ? await dialog.showOpenDialog(window, openOptions)
      : await dialog.showOpenDialog(openOptions);
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  ipcMain.handle('library:open', (_event, libraryPath: string) => {
    // An existing library is anything already holding a database or a
    // stashes tree; an empty folder is initialised as a fresh library on
    // next launch. Anything else (a folder full of unrelated files) is
    // refused rather than scattering app data through it.
    const hasDb = fs.existsSync(path.join(libraryPath, 'promptloom.sqlite'));
    const hasStashes = fs.existsSync(path.join(libraryPath, 'stashes'));
    const isEmpty = fs.existsSync(libraryPath) && fs.readdirSync(libraryPath).length === 0;
    if (!hasDb && !hasStashes && !isEmpty) return false;

    setLibraryPath(libraryPath);
    // Relaunch rather than swapping the SQLite handle underneath a live
    // renderer: a perchance save can be in flight, and every path the
    // Gallery is holding would be invalidated mid-render.
    app.relaunch();
    app.quit();
    return true;
  });

  ipcMain.handle('library:planMigration', () => planMigration(db.getDb(), db.getLibraryRoot()));
  ipcMain.handle('library:migrate', () => migrateLibrary(db.getDb(), db.getLibraryRoot()));
  ipcMain.handle('library:rollback', async () => {
    const root = db.getLibraryRoot();
    // Newest manifest wins — rollback is an "undo the migration I just ran"
    // action, not a general time machine.
    const manifests = fs
      .readdirSync(root)
      .filter((name) => /^migration-.*\.jsonl$/.test(name))
      .sort();
    const latest = manifests.at(-1);
    if (!latest) return null;
    return rollbackMigration(db.getDb(), root, path.join(root, latest));
  });
  ipcMain.handle('library:backup', () => db.backupLibrary());
  ipcMain.handle('library:integrity', () => db.checkIntegrity());

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
    fs.writeFileSync(
      txtPath,
      db.sidecarText(generation.promptText, generation.seed, generation.createdAt),
    );
    return filePath;
  });

  ipcMain.handle('driver:populatePrompt', (_event, promptText: string) =>
    populatePrompt(promptText),
  );

  ipcMain.handle('perchance:getStatus', () => getLastPerchanceStatus());

  ipcMain.handle('perchance:setHidden', (_event, hidden: boolean) =>
    setPerchanceViewHidden(hidden),
  );

  ipcMain.handle('stash:getCurrent', () => currentStash);
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
      const generation = db.saveGeneration(
        currentStash,
        prompt || '(prompt unavailable)',
        {},
        seed,
        imageDataUrl,
      );
      // Perchance's save button lives in a separate native WebContentsView,
      // not the app's own renderer — the Gallery has no other way to learn
      // a new image landed, so push it a confirmation to refresh from.
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('generations:saved', generation);
      }
    },
  );

  // Same fire-and-forget shape as perchance:saveImage above, but for a tile
  // in perchance's own community gallery (perchanceDriver.ts's injected
  // save button there): those tiles only carry a remote image URL, not an
  // already-captured data URL, so the bytes are fetched here in the main
  // process — a page-context fetch()/canvas read would be blocked by the
  // image host's own CORS policy, which doesn't apply to a Node-side fetch.
  ipcMain.on(
    'perchance:saveImageFromUrl',
    (
      _event,
      imageUrl: string,
      prompt: string,
      seed: string | null,
      imageId: string | null,
    ) => {
      void (async () => {
        try {
          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${imageUrl}`);
          const buffer = Buffer.from(await response.arrayBuffer());
          const mimeType = (response.headers.get('content-type') || 'image/png').split(';')[0];
          const imageDataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
          const generation = db.saveGeneration(
            currentStash,
            prompt || '(prompt unavailable)',
            {},
            seed,
            imageDataUrl,
            imageId,
          );
          for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send('generations:saved', generation);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[PromptLoom] failed to save gallery image from URL', imageUrl, err);
        }
      })();
    },
  );

  // Answers perchanceDriver.ts's injected gallery script: "is this tile
  // already saved?" Two-step, cheapest first — see db.ts's
  // findGenerationBySourceGalleryId/findGenerationsByPromptText for why the
  // second step exists and can't just trust the prompt match alone.
  ipcMain.handle(
    'perchance:checkGallerySaved',
    async (_event, imageId: string, prompt: string, imageUrl: string): Promise<boolean> => {
      if (db.findGenerationBySourceGalleryId(imageId)) return true;

      const candidates = db.findGenerationsByPromptText(prompt);
      if (candidates.length === 0) return false;

      let remoteHash: string;
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) return false;
        remoteHash = createHash('sha256')
          .update(Buffer.from(await response.arrayBuffer()))
          .digest('hex');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[PromptLoom] failed to fetch gallery image for content match', imageUrl, err);
        return false;
      }

      for (const candidate of candidates) {
        let localHash: string;
        try {
          localHash = createHash('sha256').update(fs.readFileSync(candidate.imagePath)).digest('hex');
        } catch {
          // The candidate's file may have since been deleted — skip it.
          continue;
        }
        if (localHash === remoteHash) {
          // Backfills the fast path so the same tile is an instant hit
          // next time, rather than re-fetching and re-hashing.
          db.setSourceGalleryId(candidate.id, imageId);
          return true;
        }
      }
      return false;
    },
  );
}

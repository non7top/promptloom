import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import AdmZip from 'adm-zip';
import type { Category, Item, Generation, GalleryImportResult } from '../shared/types';

let db: DatabaseSync;
let imagesDir: string;

export function initDb(userDataPath: string): void {
  db = new DatabaseSync(path.join(userDataPath, 'promptloom.sqlite'));
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prompt_fragment TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_label TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      selection_json TEXT NOT NULL,
      seed TEXT,
      image_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  imagesDir = path.join(userDataPath, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
}

export function listCategories(): Category[] {
  const rows = db.prepare('SELECT id, name FROM categories ORDER BY id').all() as {
    id: number;
    name: string;
  }[];
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export function createCategory(name: string): Category {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO categories (name) VALUES (?)')
    .run(name);
  return { id: Number(lastInsertRowid), name };
}

export function renameCategory(id: number, name: string): void {
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
}

export function deleteCategory(id: number): void {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}

export function listItems(): Item[] {
  const rows = db
    .prepare('SELECT id, category_id, name, prompt_fragment FROM items ORDER BY id')
    .all() as { id: number; category_id: number; name: string; prompt_fragment: string }[];
  return rows.map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    promptFragment: row.prompt_fragment,
  }));
}

export function createItem(categoryId: number, name: string, promptFragment: string): Item {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO items (category_id, name, prompt_fragment) VALUES (?, ?, ?)')
    .run(categoryId, name, promptFragment);
  return { id: Number(lastInsertRowid), categoryId, name, promptFragment };
}

export function updateItem(id: number, name: string, promptFragment: string): void {
  db.prepare('UPDATE items SET name = ?, prompt_fragment = ? WHERE id = ?').run(
    name,
    promptFragment,
    id,
  );
}

export function deleteItem(id: number): void {
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

// Same `// Category:Item` comment format Composer.tsx puts ahead of each
// fragment in the populated prompt, so a stash's saved prompts already
// double as documentation of how to reconstruct the definitions that
// produced them — export/import just reuses that format directly rather
// than inventing a separate one.
export function exportDefinitionsText(): string {
  const categoryNameById = new Map(listCategories().map((category) => [category.id, category.name]));
  return listItems()
    .map((item) => {
      const categoryName = categoryNameById.get(item.categoryId);
      return categoryName ? `// ${categoryName}:${item.name}\n${item.promptFragment}` : null;
    })
    .filter((section): section is string => Boolean(section))
    .join('\n\n');
}

interface DefinitionEntry {
  categoryName: string;
  itemName: string;
  promptFragment: string;
}

function parseDefinitionsText(text: string): DefinitionEntry[] {
  const entries: DefinitionEntry[] = [];
  let current: { categoryName: string; itemName: string; fragmentLines: string[] } | null = null;

  for (const line of text.split(/\r\n|\r|\n/)) {
    const header = /^\/\/ (.+?):(.*)$/.exec(line);
    if (header) {
      if (current) {
        entries.push({ ...current, promptFragment: current.fragmentLines.join('\n').trim() });
      }
      current = { categoryName: header[1].trim(), itemName: header[2].trim(), fragmentLines: [] };
    } else if (current) {
      current.fragmentLines.push(line);
    }
  }
  if (current) {
    entries.push({ ...current, promptFragment: current.fragmentLines.join('\n').trim() });
  }

  return entries.filter((entry) => entry.categoryName && entry.itemName && entry.promptFragment);
}

export interface DefinitionsImportResult {
  categoriesCreated: number;
  itemsCreated: number;
  itemsUpdated: number;
}

// Upserts by (category name, item name) rather than blindly inserting, so
// re-importing the same export (or one edited outside the app) updates
// fragments in place instead of piling up duplicates.
export function importDefinitionsText(text: string): DefinitionsImportResult {
  const categoryIdByName = new Map(listCategories().map((category) => [category.name, category.id]));
  const itemIdByKey = new Map(
    listItems().map((item) => [`${item.categoryId}:${item.name}`, item.id]),
  );

  const result: DefinitionsImportResult = { categoriesCreated: 0, itemsCreated: 0, itemsUpdated: 0 };

  for (const entry of parseDefinitionsText(text)) {
    let categoryId = categoryIdByName.get(entry.categoryName);
    if (categoryId === undefined) {
      categoryId = createCategory(entry.categoryName).id;
      categoryIdByName.set(entry.categoryName, categoryId);
      result.categoriesCreated += 1;
    }

    const key = `${categoryId}:${entry.itemName}`;
    const existingItemId = itemIdByKey.get(key);
    if (existingItemId !== undefined) {
      updateItem(existingItemId, entry.itemName, entry.promptFragment);
      result.itemsUpdated += 1;
    } else {
      const item = createItem(categoryId, entry.itemName, entry.promptFragment);
      itemIdByKey.set(key, item.id);
      result.itemsCreated += 1;
    }
  }

  return result;
}

export function listGenerations(): Generation[] {
  const rows = db
    .prepare(
      'SELECT id, batch_label, prompt_text, selection_json, seed, image_path, created_at FROM generations ORDER BY id DESC',
    )
    .all() as {
    id: number;
    batch_label: string;
    prompt_text: string;
    selection_json: string;
    seed: string | null;
    image_path: string;
    created_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    batchLabel: row.batch_label,
    promptText: row.prompt_text,
    selection: JSON.parse(row.selection_json),
    seed: row.seed,
    imagePath: row.image_path,
    imageUrl: pathToFileURL(row.image_path).href,
    createdAt: row.created_at,
  }));
}

// A companion .txt file next to each image, so the prompt and seed stay
// readable/portable straight from the stash folder on disk, not just the
// app's own database.
export function sidecarText(promptText: string, seed: string | null): string {
  // perchance's own syntax for forcing a specific seed when the prompt text
  // is pasted back in, so a sidecar file is enough to reproduce a result.
  return `Prompt: ${promptText}\nSeed: ${seed ? `(seed:::${seed})` : 'unknown'}\n`;
}

// Random names, not sequential IDs — a stash folder can end up with
// millions of these, and there's no reason to expose (or rely on) the DB's
// row order in the filename. Shared by saveGeneration (renderer capture, a
// data URL) and importGalleryZip (a zip entry, already raw bytes).
function writeGenerationFiles(
  promptText: string,
  seed: string | null,
  imageBytes: Buffer,
  ext: string,
): string {
  const baseName = randomUUID();
  const imagePath = path.join(imagesDir, `${baseName}.${ext}`);
  fs.writeFileSync(imagePath, imageBytes);
  fs.writeFileSync(path.join(imagesDir, `${baseName}.txt`), sidecarText(promptText, seed));
  return imagePath;
}

export function saveGeneration(
  batchLabel: string,
  promptText: string,
  selection: Record<number, number>,
  seed: string | null,
  imageDataUrl: string,
): Generation {
  const createdAt = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO generations (batch_label, prompt_text, selection_json, seed, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(batchLabel, promptText, JSON.stringify(selection), seed, '', createdAt);
  const id = Number(lastInsertRowid);

  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const imagePath = writeGenerationFiles(promptText, seed, Buffer.from(base64, 'base64'), 'png');
  db.prepare('UPDATE generations SET image_path = ? WHERE id = ?').run(imagePath, id);

  return {
    id,
    batchLabel,
    promptText,
    selection,
    seed,
    imagePath,
    imageUrl: pathToFileURL(imagePath).href,
    createdAt,
  };
}

// A stash label can contain characters that aren't safe as a zip/filesystem
// folder name (e.g. someone pastes a prompt fragment as the stash name) —
// sanitize for the folder, but keep the original label as the DB value
// (round-tripped separately, not derived from the sanitized folder name).
function sanitizeFolderName(label: string): string {
  const cleaned = label.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || 'Unsorted';
}

// Exported structure is deliberately just folders-of-(image, sidecar .txt)
// — the same pairing already used in imagesDir — rather than a manifest
// format of our own: it's directly browsable (open the zip, view the PNGs,
// read the prompt/seed next to each one) and re-importable using only that
// pairing, no app-specific format to parse.
export function exportGalleryZip(destPath: string): number {
  const zip = new AdmZip();
  let count = 0;
  for (const generation of listGenerations()) {
    if (!fs.existsSync(generation.imagePath)) continue;
    const folder = sanitizeFolderName(generation.batchLabel);
    const base = path.basename(generation.imagePath, path.extname(generation.imagePath));
    const ext = path.extname(generation.imagePath).slice(1) || 'png';
    zip.addFile(`${folder}/${base}.${ext}`, fs.readFileSync(generation.imagePath));
    zip.addFile(
      `${folder}/${base}.txt`,
      Buffer.from(sidecarText(generation.promptText, generation.seed), 'utf-8'),
    );
    count += 1;
  }
  zip.writeZip(destPath);
  return count;
}

// Inverse of sidecarText() — tolerant of the prompt itself spanning
// multiple lines (it usually does), since the greedy match only backs off
// as far as the final "\nSeed: " line, wherever that actually falls.
function parseSidecarText(text: string): { promptText: string; seed: string | null } {
  const match = /^Prompt: ([\s\S]*)\nSeed: (.*?)\s*$/.exec(text);
  if (!match) return { promptText: text.trim(), seed: null };
  const [, promptText, seedPart] = match;
  const seedMatch = /^\(seed:::(.*)\)$/.exec(seedPart.trim());
  return { promptText, seed: seedMatch ? seedMatch[1] : null };
}

const IMPORT_IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

// Folder name becomes the batch label verbatim (whatever was exported, or
// whatever a human named the folder by hand) — every image/sidecar pair
// inside it imports as one generation. A bare image with no matching .txt
// still imports fine (just with an empty prompt and no seed), so a folder
// of plain images dropped in by hand is valid input too, not just our own
// export output.
export function importGalleryZip(zipPath: string): GalleryImportResult {
  const zip = new AdmZip(zipPath);
  const byFolder = new Map<string, AdmZip.IZipEntry[]>();

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const parts = entry.entryName.split('/').filter(Boolean);
    if (parts.length < 2) continue; // loose file at the zip root, not inside a stash folder
    const list = byFolder.get(parts[0]) ?? [];
    list.push(entry);
    byFolder.set(parts[0], list);
  }

  let imported = 0;
  let skipped = 0;

  for (const [batchLabel, entries] of byFolder) {
    const byBase = new Map<string, { image?: AdmZip.IZipEntry; sidecar?: AdmZip.IZipEntry }>();
    for (const entry of entries) {
      const name = entry.entryName.split('/').pop() as string;
      const isImage = IMPORT_IMAGE_EXT.test(name);
      const isSidecar = /\.txt$/i.test(name);
      if (!isImage && !isSidecar) continue;
      const base = name.replace(/\.(png|jpe?g|webp|gif|txt)$/i, '');
      const record = byBase.get(base) ?? {};
      if (isImage) record.image = entry;
      if (isSidecar) record.sidecar = entry;
      byBase.set(base, record);
    }

    for (const { image, sidecar } of byBase.values()) {
      if (!image) {
        skipped += 1;
        continue;
      }
      const ext = IMPORT_IMAGE_EXT.exec(image.entryName)?.[1].toLowerCase() ?? 'png';
      const { promptText, seed } = sidecar
        ? parseSidecarText(sidecar.getData().toString('utf-8'))
        : { promptText: '', seed: null };
      const imagePath = writeGenerationFiles(promptText, seed, image.getData(), ext);
      const createdAt = new Date().toISOString();
      db.prepare(
        'INSERT INTO generations (batch_label, prompt_text, selection_json, seed, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(batchLabel, promptText, JSON.stringify({}), seed, imagePath, createdAt);
      imported += 1;
    }
  }

  return { imported, skipped };
}

export function getGeneration(id: number): Generation | null {
  const row = db
    .prepare(
      'SELECT id, batch_label, prompt_text, selection_json, seed, image_path, created_at FROM generations WHERE id = ?',
    )
    .get(id) as
    | {
        id: number;
        batch_label: string;
        prompt_text: string;
        selection_json: string;
        seed: string | null;
        image_path: string;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    batchLabel: row.batch_label,
    promptText: row.prompt_text,
    selection: JSON.parse(row.selection_json),
    seed: row.seed,
    imagePath: row.image_path,
    imageUrl: pathToFileURL(row.image_path).href,
    createdAt: row.created_at,
  };
}

function removeImageAndSidecar(imagePath: string): void {
  fs.rmSync(imagePath, { force: true });
  fs.rmSync(imagePath.replace(/\.png$/i, '') + '.txt', { force: true });
}

export function deleteGeneration(id: number): void {
  const row = db.prepare('SELECT image_path FROM generations WHERE id = ?').get(id) as
    | { image_path: string }
    | undefined;
  db.prepare('DELETE FROM generations WHERE id = ?').run(id);
  if (row?.image_path) {
    removeImageAndSidecar(row.image_path);
  }
}

export function deleteBatch(batchLabel: string): void {
  const rows = db
    .prepare('SELECT image_path FROM generations WHERE batch_label = ?')
    .all(batchLabel) as { image_path: string }[];
  db.prepare('DELETE FROM generations WHERE batch_label = ?').run(batchLabel);
  for (const row of rows) {
    removeImageAndSidecar(row.image_path);
  }
}

export function renameBatch(oldLabel: string, newLabel: string): void {
  db.prepare('UPDATE generations SET batch_label = ? WHERE batch_label = ?').run(
    newLabel,
    oldLabel,
  );
}

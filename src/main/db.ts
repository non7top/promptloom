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
      created_at TEXT NOT NULL,
      source_gallery_id TEXT
    );
  `);

  // CREATE TABLE IF NOT EXISTS above is a no-op for an existing install's
  // generations table, which predates source_gallery_id — add it explicitly
  // when missing instead of assuming every install already has it.
  const generationsColumns = db.prepare('PRAGMA table_info(generations)').all() as {
    name: string;
  }[];
  if (!generationsColumns.some((column) => column.name === 'source_gallery_id')) {
    db.exec('ALTER TABLE generations ADD COLUMN source_gallery_id TEXT;');
  }
  // Backs both halves of the perchance-gallery "already saved?" check
  // (perchanceDriver.ts's injected script, via ipc.ts's
  // perchance:checkGallerySaved): the fast path looks up source_gallery_id
  // directly, the slow path (for anything saved before that column existed,
  // or saved via the generator's own save button, which never sets it)
  // looks up prompt_text instead.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_generations_source_gallery_id ON generations(source_gallery_id);
    CREATE INDEX IF NOT EXISTS idx_generations_prompt_text ON generations(prompt_text);
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

// A companion .txt file next to each image, so the prompt/seed/creation
// time stay readable/portable straight from the stash folder on disk, not
// just the app's own database. createdAt is what lets importGalleryZip
// reconstruct the original ordering (see there) rather than falling back
// to a zip's own (alphabetical-by-filename) entry order.
export function sidecarText(promptText: string, seed: string | null, createdAt: string): string {
  // perchance's own syntax for forcing a specific seed when the prompt text
  // is pasted back in, so a sidecar file is enough to reproduce a result.
  return `Prompt: ${promptText}\nSeed: ${seed ? `(seed:::${seed})` : 'unknown'}\nCreated: ${createdAt}\n`;
}

// Random names, not sequential IDs — a stash folder can end up with
// millions of these, and there's no reason to expose (or rely on) the DB's
// row order in the filename. Shared by saveGeneration (renderer capture, a
// data URL) and importGalleryZip (a zip entry, already raw bytes).
function writeGenerationFiles(
  promptText: string,
  seed: string | null,
  createdAt: string,
  imageBytes: Buffer,
  ext: string,
): string {
  const baseName = randomUUID();
  const imagePath = path.join(imagesDir, `${baseName}.${ext}`);
  fs.writeFileSync(imagePath, imageBytes);
  fs.writeFileSync(
    path.join(imagesDir, `${baseName}.txt`),
    sidecarText(promptText, seed, createdAt),
  );
  return imagePath;
}

export function saveGeneration(
  batchLabel: string,
  promptText: string,
  selection: Record<number, number>,
  seed: string | null,
  imageDataUrl: string,
  // Set only when this came from perchance's own community gallery (see
  // ipc.ts's perchance:saveImageFromUrl) — populates the fast path for
  // findGenerationBySourceGalleryId below. Every other caller (Composer's
  // own saves, the generator's own save button, zip imports) leaves it
  // null, since there's no such external ID to record.
  sourceGalleryId: string | null = null,
): Generation {
  const createdAt = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO generations (batch_label, prompt_text, selection_json, seed, image_path, created_at, source_gallery_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(batchLabel, promptText, JSON.stringify(selection), seed, '', createdAt, sourceGalleryId);
  const id = Number(lastInsertRowid);

  // Extension follows the data URL's own mime subtype rather than being
  // hardcoded, since callers other than perchance's own (PNG) save button
  // — e.g. saving a JPEG straight from the community gallery — pass through
  // whatever format the source actually was.
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(imageDataUrl);
  const ext = match?.[1] || 'png';
  const base64 = match?.[2] ?? imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const imagePath = writeGenerationFiles(
    promptText,
    seed,
    createdAt,
    Buffer.from(base64, 'base64'),
    ext,
  );
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

// Fast path for "has this perchance gallery image already been saved?" —
// a direct indexed lookup, no network/hashing needed. See
// findGenerationsByPromptText below for the slow-path fallback this misses
// (anything saved before source_gallery_id existed, or via the generator's
// own save button).
export function findGenerationBySourceGalleryId(sourceGalleryId: string): boolean {
  const row = db
    .prepare('SELECT id FROM generations WHERE source_gallery_id = ? LIMIT 1')
    .get(sourceGalleryId) as { id: number } | undefined;
  return row !== undefined;
}

// Slow-path candidates for the same check: an exact prompt_text match is a
// strong signal on its own (perchance's gallery prompts are long and
// boilerplate-heavy, rarely identical by coincidence), but not proof by
// itself — a "custom" save via the generator's own save button can and does
// reuse identical prompt text across genuinely different images (same
// prompt, different seed), so the caller still needs to content-hash-
// compare each candidate's actual bytes against the gallery image's.
export function findGenerationsByPromptText(promptText: string): { id: number; imagePath: string }[] {
  const rows = db
    .prepare('SELECT id, image_path FROM generations WHERE prompt_text = ?')
    .all(promptText) as { id: number; image_path: string }[];
  return rows.map((row) => ({ id: row.id, imagePath: row.image_path }));
}

// Called once a slow-path content-hash match is confirmed, so the same
// image hits the fast path next time instead of re-fetching and re-hashing.
export function setSourceGalleryId(id: number, sourceGalleryId: string): void {
  db.prepare('UPDATE generations SET source_gallery_id = ? WHERE id = ?').run(sourceGalleryId, id);
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
      Buffer.from(sidecarText(generation.promptText, generation.seed, generation.createdAt), 'utf-8'),
    );
    count += 1;
  }
  zip.writeZip(destPath);
  return count;
}

function parseSeedPart(seedPart: string): string | null {
  const seedMatch = /^\(seed:::(.*)\)$/.exec(seedPart.trim());
  return seedMatch ? seedMatch[1] : null;
}

// Inverse of sidecarText() — tolerant of the prompt itself spanning
// multiple lines (it usually does), since the greedy match only backs off
// as far as the final "\nSeed: ...\nCreated: " lines, wherever those
// actually fall. Also tolerant of a sidecar exported before the "Created:"
// line existed — createdAt comes back null rather than failing to parse.
function parseSidecarText(text: string): {
  promptText: string;
  seed: string | null;
  createdAt: string | null;
} {
  const withCreated = /^Prompt: ([\s\S]*)\nSeed: (.*)\nCreated: (.*?)\s*$/.exec(text);
  if (withCreated) {
    const [, promptText, seedPart, createdAt] = withCreated;
    return { promptText, seed: parseSeedPart(seedPart), createdAt };
  }
  const withoutCreated = /^Prompt: ([\s\S]*)\nSeed: (.*?)\s*$/.exec(text);
  if (withoutCreated) {
    const [, promptText, seedPart] = withoutCreated;
    return { promptText, seed: parseSeedPart(seedPart), createdAt: null };
  }
  return { promptText: text.trim(), seed: null, createdAt: null };
}

const IMPORT_IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

// Folder name becomes the batch label verbatim (whatever was exported, or
// whatever a human named the folder by hand) — every image/sidecar pair
// inside it imports as one generation. A bare image with no matching .txt
// still imports fine (just with an empty prompt and no seed), so a folder
// of plain images dropped in by hand is valid input too, not just our own
// export output.
interface PendingImport {
  batchLabel: string;
  image: AdmZip.IZipEntry;
  promptText: string;
  seed: string | null;
  createdAt: string | null;
}

export function importGalleryZip(zipPath: string): GalleryImportResult {
  // Deliberately NOT relying on the order zip.getEntries() returns things
  // in: adm-zip re-sorts entries alphabetically by filename on read (its
  // own default, not something we opted into), and our filenames are
  // random UUIDs, so that order has nothing to do with creation order.
  // Every pending item's real createdAt (from its sidecar) is collected
  // first, then everything is sorted by that before any DB insert — insert
  // order is what fixes each row's auto-increment id, which is what
  // listGenerations()'s `ORDER BY id DESC` actually displays by.
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

  const pending: PendingImport[] = [];
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
      const { promptText, seed, createdAt } = sidecar
        ? parseSidecarText(sidecar.getData().toString('utf-8'))
        : { promptText: '', seed: null, createdAt: null };
      pending.push({ batchLabel, image, promptText, seed, createdAt });
    }
  }

  // Unknown createdAt (no sidecar, or one from before this field existed)
  // sorts first — there's no way to know its real position, and it's no
  // worse than the alphabetical-by-UUID order this replaces.
  pending.sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  let imported = 0;
  for (const item of pending) {
    const ext = IMPORT_IMAGE_EXT.exec(item.image.entryName)?.[1].toLowerCase() ?? 'png';
    const createdAt = item.createdAt ?? new Date().toISOString();
    const imagePath = writeGenerationFiles(
      item.promptText,
      item.seed,
      createdAt,
      item.image.getData(),
      ext,
    );
    db.prepare(
      'INSERT INTO generations (batch_label, prompt_text, selection_json, seed, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(item.batchLabel, item.promptText, JSON.stringify({}), item.seed, imagePath, createdAt);
    imported += 1;
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

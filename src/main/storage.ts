import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { MigrationReport } from '../shared/types';

// Everything a library owns lives under one folder, so the whole thing can be
// copied to another disk or machine and still work:
//
//   <library>/promptloom.sqlite
//   <library>/stashes/<batch label>/<uuid>.png
//   <library>/stashes/<batch label>/<uuid>.json
//   <library>/stashes/<batch label>/<uuid>.txt
//   <library>/stashes/<batch label>/index.json
//   <library>/stashes/index.json
//
// That per-group layout is deliberately the same shape exportGalleryZip
// already produces (<folder>/<uuid>.<ext> plus a .txt sidecar), so the live
// tree and an exported zip are structurally identical and importGalleryZip
// keeps working unchanged.
export const STASHES_DIRNAME = 'stashes';
// Where every image used to live, flat, before the per-group layout.
export const LEGACY_IMAGES_DIRNAME = 'images';

// Windows rejects these as filenames regardless of extension, and a stash
// label is free text a user types.
const RESERVED_WINDOWS_NAMES =
  /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

// One path segment of a label. `/` is NOT handled here — labelToRelDir splits
// on it first, which is what makes nested labels ("characters/hermione") turn
// into nested folders rather than one folder with an underscore in its name.
export function sanitizeSegment(segment: string): string {
  const cleaned = segment
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what has to be stripped from a filename here.
    .replace(/[\\:*?"<>|\u0000-\u001f]/g, '_')
    // Windows silently drops trailing dots and spaces, so a folder created
    // as "foo." comes back as "foo" and no longer matches what's in the DB.
    .replace(/[. ]+$/, '')
    .trim();
  if (!cleaned) return 'Unsorted';
  if (RESERVED_WINDOWS_NAMES.test(cleaned)) return `_${cleaned}`;
  // Leaves room for <uuid>.jpeg plus the library path itself under Windows'
  // 260-character limit.
  return cleaned.slice(0, 64);
}

export function labelToRelDir(label: string): string {
  const segments = label
    .split(/[/\\]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(sanitizeSegment);
  return segments.length ? segments.join(path.sep) : 'Unsorted';
}

export function stashesDir(libraryPath: string): string {
  return path.join(libraryPath, STASHES_DIRNAME);
}

export function groupDir(libraryPath: string, label: string): string {
  return path.join(stashesDir(libraryPath), labelToRelDir(label));
}

// The sidecar sits next to the image under the same basename. Deriving it by
// stripping *any* extension is the fix for the long-standing bug where this
// was `imagePath.replace(/\.png$/i, '') + '.txt'` — half the library is
// stored as .jpeg, and for those that produced "<uuid>.jpeg.txt", a path
// that never exists, so deleting a .jpeg generation orphaned its sidecar.
export function sidecarPathFor(imagePath: string): string {
  const dir = path.dirname(imagePath);
  const base = path.basename(imagePath, path.extname(imagePath));
  return path.join(dir, `${base}.txt`);
}

export function jsonPathFor(imagePath: string): string {
  const dir = path.dirname(imagePath);
  const base = path.basename(imagePath, path.extname(imagePath));
  return path.join(dir, `${base}.json`);
}

// Rows written before the per-group migration hold absolute paths; rows
// written after hold paths relative to the library root, which is what makes
// a library portable. Both have to keep resolving.
export function resolveImagePath(libraryPath: string, stored: string): string {
  return path.isAbsolute(stored) ? stored : path.join(libraryPath, stored);
}

export function toStoredPath(libraryPath: string, absolute: string): string {
  const relative = path.relative(libraryPath, absolute);
  // Anything outside the library (shouldn't happen, but a hand-edited DB or
  // a symlinked image would do it) stays absolute rather than becoming a
  // "../.." path that breaks the moment the library moves.
  return relative && !relative.startsWith('..') ? relative : absolute;
}

export function freeSpaceBytes(dirPath: string): number {
  // statfs needs an existing path; walk up until one is found so this still
  // answers for a library folder that hasn't been created yet.
  let probe = path.resolve(dirPath);
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) return 0;
    probe = parent;
  }
  const stats = fs.statfsSync(probe);
  return Number(stats.bavail) * Number(stats.bsize);
}

export interface GenerationRow {
  id: number;
  batch_label: string;
  prompt_text: string;
  selection_json: string;
  seed: string | null;
  image_path: string;
  created_at: string;
}

export function imageJsonContent(row: GenerationRow, imageFileName: string): string {
  return `${JSON.stringify(
    {
      id: row.id,
      batchLabel: row.batch_label,
      prompt: row.prompt_text,
      seed: row.seed,
      selection: JSON.parse(row.selection_json || '{}'),
      createdAt: row.created_at,
      image: imageFileName,
    },
    null,
    2,
  )}\n`;
}

// Written last, after every file is in place, so a half-finished migration
// leaves no index claiming files that aren't there. Both indexes are pure
// derivations of the database and can be regenerated at any time.
export function writeIndexes(db: DatabaseSync, libraryPath: string): void {
  const rows = db
    .prepare(
      'SELECT id, batch_label, prompt_text, selection_json, seed, image_path, created_at FROM generations ORDER BY id',
    )
    .all() as unknown as GenerationRow[];

  const byLabel = new Map<string, GenerationRow[]>();
  for (const row of rows) {
    const label = row.batch_label || 'Unsorted';
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label)?.push(row);
  }

  const root: Record<string, { folder: string; count: number; updatedAt: string }> = {};
  for (const [label, group] of byLabel) {
    const dir = groupDir(libraryPath, label);
    fs.mkdirSync(dir, { recursive: true });
    const entries = group.map((row) => ({
      id: row.id,
      image: path.basename(resolveImagePath(libraryPath, row.image_path)),
      prompt: row.prompt_text,
      seed: row.seed,
      createdAt: row.created_at,
    }));
    writeFileAtomic(
      path.join(dir, 'index.json'),
      `${JSON.stringify({ label, count: entries.length, images: entries }, null, 2)}\n`,
    );
    root[label] = {
      folder: labelToRelDir(label),
      count: entries.length,
      updatedAt: new Date().toISOString(),
    };
  }

  fs.mkdirSync(stashesDir(libraryPath), { recursive: true });
  writeFileAtomic(
    path.join(stashesDir(libraryPath), 'index.json'),
    `${JSON.stringify(root, null, 2)}\n`,
  );
}

export function writeFileAtomic(filePath: string, contents: string | Buffer): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

// Rough headroom for the DB snapshot plus the per-image JSON files. The
// images themselves are *renamed*, not copied, so the migration moves no
// bytes — but refusing to start on a nearly-full disk is the whole point,
// since disk-full mid-write is the one realistic way to corrupt SQLite.
const MIGRATION_SLACK_BYTES = 100 * 1024 * 1024;

export function planMigration(db: DatabaseSync, libraryPath: string): MigrationReport {
  const rows = db
    .prepare(
      'SELECT id, batch_label, prompt_text, selection_json, seed, image_path, created_at FROM generations ORDER BY id',
    )
    .all() as unknown as GenerationRow[];

  const groups = new Map<string, { folder: string; count: number }>();
  const foldersToLabels = new Map<string, Set<string>>();
  let alreadyMigrated = 0;
  let toMove = 0;
  let missingFiles = 0;

  for (const row of rows) {
    const label = row.batch_label || 'Unsorted';
    const folder = labelToRelDir(label);
    const entry = groups.get(label) ?? { folder, count: 0 };
    entry.count += 1;
    groups.set(label, entry);

    if (!foldersToLabels.has(folder)) foldersToLabels.set(folder, new Set());
    foldersToLabels.get(folder)?.add(label);

    const absolute = resolveImagePath(libraryPath, row.image_path);
    if (!fs.existsSync(absolute)) {
      missingFiles += 1;
      continue;
    }
    if (!path.isAbsolute(row.image_path) && absolute.startsWith(stashesDir(libraryPath))) {
      alreadyMigrated += 1;
    } else {
      toMove += 1;
    }
  }

  // Two different labels sanitizing to one folder would silently merge two
  // stashes on disk. Refuse rather than guess which one wins.
  const collisions = Array.from(foldersToLabels.entries())
    .filter(([, labels]) => labels.size > 1)
    .map(([folder, labels]) => ({ folder, labels: Array.from(labels) }));

  const dbPath = path.join(libraryPath, 'promptloom.sqlite');
  const dbBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

  return {
    dryRun: true,
    totalRows: rows.length,
    alreadyMigrated,
    toMove,
    missingFiles,
    groups: Array.from(groups.entries())
      .map(([label, g]) => ({ label, folder: g.folder, count: g.count }))
      .sort((a, b) => b.count - a.count),
    collisions,
    freeBytes: freeSpaceBytes(libraryPath),
    requiredBytes: dbBytes + MIGRATION_SLACK_BYTES,
    manifestPath: null,
    backupPath: null,
    moved: 0,
    errors: [],
  };
}

export function migrateLibrary(db: DatabaseSync, libraryPath: string): MigrationReport {
  const report = planMigration(db, libraryPath);
  report.dryRun = false;

  if (report.collisions.length) {
    report.errors.push(
      `${report.collisions.length} folder name collision(s) — rename the stashes first, nothing was moved.`,
    );
    return report;
  }
  if (report.freeBytes < report.requiredBytes) {
    report.errors.push(
      `Not enough free space: ${Math.round(report.freeBytes / 1048576)}MB available, ${Math.round(report.requiredBytes / 1048576)}MB required.`,
    );
    return report;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Snapshot first. VACUUM INTO writes a consistent copy without stopping
  // the world, and it is a plain .sqlite file — restoring is a file copy,
  // not an import.
  const backupPath = path.join(libraryPath, `promptloom.backup-${stamp}.sqlite`);
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  report.backupPath = backupPath;

  // The manifest is what makes this reversible, so it is opened before a
  // single file moves and appended to as we go, never buffered.
  const manifestPath = path.join(libraryPath, `migration-${stamp}.jsonl`);
  report.manifestPath = manifestPath;
  const manifest = fs.openSync(manifestPath, 'a');

  try {
    const rows = db
      .prepare(
        'SELECT id, batch_label, prompt_text, selection_json, seed, image_path, created_at FROM generations ORDER BY id',
      )
      .all() as unknown as GenerationRow[];

    for (const row of rows) {
      const from = resolveImagePath(libraryPath, row.image_path);
      if (!fs.existsSync(from)) continue;

      const label = row.batch_label || 'Unsorted';
      const dir = groupDir(libraryPath, label);
      const to = path.join(dir, path.basename(from));
      if (from === to) continue;

      try {
        fs.mkdirSync(dir, { recursive: true });

        const fromSidecar = sidecarPathFor(from);
        const toSidecar = sidecarPathFor(to);

        fs.appendFileSync(
          manifest,
          `${JSON.stringify({ id: row.id, from, to, storedBefore: row.image_path })}\n`,
        );

        // Same volume, so this is an atomic metadata operation — no bytes
        // are copied and there is no window where the file is half-written.
        fs.renameSync(from, to);
        if (fs.existsSync(fromSidecar)) fs.renameSync(fromSidecar, toSidecar);
        writeFileAtomic(jsonPathFor(to), imageJsonContent(row, path.basename(to)));

        // Committed per row rather than in one transaction: a crash then
        // leaves a consistent prefix, and re-running resumes from there
        // instead of rolling 3,000 moves back.
        db.prepare('UPDATE generations SET image_path = ? WHERE id = ?').run(
          toStoredPath(libraryPath, to),
          row.id,
        );
        report.moved += 1;
      } catch (err) {
        report.errors.push(`id ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    fs.closeSync(manifest);
  }

  writeIndexes(db, libraryPath);

  // Only if it actually emptied — anything left behind is unaccounted for
  // and deleting it would be destroying data we failed to migrate.
  const legacyDir = path.join(libraryPath, LEGACY_IMAGES_DIRNAME);
  try {
    if (fs.existsSync(legacyDir) && fs.readdirSync(legacyDir).length === 0) {
      fs.rmdirSync(legacyDir);
    }
  } catch {
    // Leaving the empty directory behind is harmless.
  }

  return report;
}

export function rollbackMigration(
  db: DatabaseSync,
  libraryPath: string,
  manifestPath: string,
): { restored: number; errors: string[] } {
  const errors: string[] = [];
  let restored = 0;

  const lines = fs
    .readFileSync(manifestPath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    // Reverse order, so this undoes the moves in the opposite sequence they
    // were made.
    .reverse();

  for (const line of lines) {
    try {
      const { id, from, to, storedBefore } = JSON.parse(line) as {
        id: number;
        from: string;
        to: string;
        storedBefore: string;
      };
      if (fs.existsSync(to)) {
        fs.mkdirSync(path.dirname(from), { recursive: true });
        fs.renameSync(to, from);
        const toSidecar = sidecarPathFor(to);
        if (fs.existsSync(toSidecar)) fs.renameSync(toSidecar, sidecarPathFor(from));
        fs.rmSync(jsonPathFor(to), { force: true });
      }
      db.prepare('UPDATE generations SET image_path = ? WHERE id = ?').run(storedBefore, id);
      restored += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { restored, errors };
}

// Exercises the library migration end to end against a synthetic library in
// a temp directory: builds the pre-migration layout (flat images/, absolute
// image_path), migrates it, asserts the result, then rolls it back and
// asserts the original state is restored.
//
// This is deliberately a standalone script rather than a test-framework
// suite — the repo has no test runner, and the thing worth checking here is
// filesystem and SQLite behaviour, which is exactly what a real runner would
// have to stub out anyway.
//
//   docker compose run --rm dev npx tsc -p tsconfig.json --outDir /tmp/mc --noEmit false
//   docker compose run --rm dev node /tmp/mc/scripts/migration-check.js
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  groupDir,
  jsonPathFor,
  labelToRelDir,
  migrateLibrary,
  planMigration,
  rollbackMigration,
  sidecarPathFor,
} from '../src/main/storage';

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// Labels chosen to cover the shapes the real library actually contains: a
// plain date, a name with spaces and commas, one needing sanitisation, and a
// nested path.
const FIXTURES: { label: string; ext: string }[] = [
  { label: '2026-08-31', ext: 'png' },
  { label: '2026-08-31', ext: 'jpeg' },
  { label: 'Stash 7_17_2026, 2_49_06 AM', ext: 'png' },
  { label: 'has:illegal*chars', ext: 'jpeg' },
  { label: 'characters/hermione', ext: 'png' },
  { label: 'Unsorted', ext: 'jpeg' },
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promptloom-migration-'));
const imagesDir = path.join(root, 'images');
fs.mkdirSync(imagesDir, { recursive: true });

const db = new DatabaseSync(path.join(root, 'promptloom.sqlite'));
db.exec(`
  CREATE TABLE generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_label TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    selection_json TEXT NOT NULL,
    seed TEXT,
    image_path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const originals: { id: number; image: string; sidecar: string }[] = [];

FIXTURES.forEach((fixture, index) => {
  const base = `image-${index}`;
  const imagePath = path.join(imagesDir, `${base}.${fixture.ext}`);
  fs.writeFileSync(imagePath, `fake ${fixture.ext} bytes ${index}`);
  fs.writeFileSync(sidecarPathFor(imagePath), `Prompt: p${index}\nSeed: (seed:::${index})\n`);
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO generations (batch_label, prompt_text, selection_json, seed, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      fixture.label,
      `prompt ${index}`,
      '{}',
      String(index),
      imagePath,
      new Date(2026, 7, index + 1).toISOString(),
    );
  originals.push({
    id: Number(lastInsertRowid),
    image: imagePath,
    sidecar: sidecarPathFor(imagePath),
  });
});

console.log(`library: ${root}`);

console.log('\nplan:');
const plan = planMigration(db, root);
check('dry run reports every row as movable', plan.toMove === FIXTURES.length, `toMove=${plan.toMove}`);
check('dry run finds no collisions', plan.collisions.length === 0);
check('dry run finds no missing files', plan.missingFiles === 0);
check('dry run changes nothing on disk', fs.readdirSync(imagesDir).length === FIXTURES.length * 2);

console.log('\nmigrate:');
const report = migrateLibrary(db, root);
check('every row moved', report.moved === FIXTURES.length, `moved=${report.moved}`);
check('no errors', report.errors.length === 0, report.errors.join('; '));
check('a snapshot was written', !!report.backupPath && fs.existsSync(report.backupPath));
check('a manifest was written', !!report.manifestPath && fs.existsSync(report.manifestPath));
check('legacy images/ is emptied', !fs.existsSync(imagesDir) || fs.readdirSync(imagesDir).length === 0);

const migrated = db
  .prepare('SELECT id, batch_label, image_path FROM generations ORDER BY id')
  .all() as unknown as { id: number; batch_label: string; image_path: string }[];

check(
  'stored paths are relative',
  migrated.every((row) => !path.isAbsolute(row.image_path)),
  migrated.map((r) => r.image_path).join(', '),
);
check(
  'every image sits in its stash folder',
  migrated.every((row) =>
    fs.existsSync(path.join(root, row.image_path)) &&
    path.join(root, row.image_path).startsWith(groupDir(root, row.batch_label)),
  ),
);
check(
  'sidecars followed their images',
  migrated.every((row) => fs.existsSync(sidecarPathFor(path.join(root, row.image_path)))),
);
check(
  'per-image json was written',
  migrated.every((row) => fs.existsSync(jsonPathFor(path.join(root, row.image_path)))),
);
check(
  'illegal characters are sanitised out of folder names',
  labelToRelDir('has:illegal*chars') === 'has_illegal_chars',
  labelToRelDir('has:illegal*chars'),
);
check(
  'spaces and commas survive in folder names',
  labelToRelDir('Stash 7_17_2026, 2_49_06 AM') === 'Stash 7_17_2026, 2_49_06 AM',
  labelToRelDir('Stash 7_17_2026, 2_49_06 AM'),
);
check(
  'a nested label becomes nested folders',
  labelToRelDir('characters/hermione') === path.join('characters', 'hermione'),
);
check('group index written', fs.existsSync(path.join(groupDir(root, '2026-08-31'), 'index.json')));
check('root index written', fs.existsSync(path.join(root, 'stashes', 'index.json')));

console.log('\nre-run (idempotence):');
const second = migrateLibrary(db, root);
check('nothing left to move', second.moved === 0, `moved=${second.moved}`);
check('re-run reports no errors', second.errors.length === 0, second.errors.join('; '));

console.log('\nrollback:');
const rolled = rollbackMigration(db, root, report.manifestPath as string);
check('every file restored', rolled.restored === FIXTURES.length, `restored=${rolled.restored}`);
check('rollback reports no errors', rolled.errors.length === 0, rolled.errors.join('; '));
check(
  'images are back in their original locations',
  originals.every((o) => fs.existsSync(o.image)),
);
check(
  'sidecars are back too',
  originals.every((o) => fs.existsSync(o.sidecar)),
);
const restored = db.prepare('SELECT image_path FROM generations').all() as unknown as {
  image_path: string;
}[];
check(
  'stored paths are absolute again',
  restored.every((row) => path.isAbsolute(row.image_path)),
);

db.close();
fs.rmSync(root, { recursive: true, force: true });

console.log(`\n${failures ? `${failures} check(s) FAILED` : 'all checks passed'}`);
process.exit(failures ? 1 : 0);

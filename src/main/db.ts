import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { Category, Item } from '../shared/types';

let db: DatabaseSync;

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
  `);
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

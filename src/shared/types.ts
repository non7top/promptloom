export interface Category {
  id: number;
  name: string;
}

export interface Item {
  id: number;
  categoryId: number;
  name: string;
  promptFragment: string;
}

export interface DefinitionsImportResult {
  categoriesCreated: number;
  itemsCreated: number;
  itemsUpdated: number;
}

export interface GalleryExportResult {
  filePath: string;
  count: number;
}

export interface GalleryImportResult {
  imported: number;
  skipped: number;
}

// Export/import are triggered from the native app menu (main.ts), not a
// renderer button — there's no request/response call to hand a result
// back through, so the main process pushes it here instead. `result` is
// null when the user cancels the save/open dialog.
export type GalleryActionResult =
  | { kind: 'export'; result: GalleryExportResult | null }
  | { kind: 'import'; result: GalleryImportResult | null };

export interface Generation {
  id: number;
  batchLabel: string;
  promptText: string;
  selection: Record<number, number>; // categoryId -> itemId
  seed: string | null;
  imagePath: string;
  imageUrl: string;
  createdAt: string;
}

// Result of both the dry run and the real migration — same shape, so the
// preview a user approves is literally the same report they get back
// afterwards, with `dryRun` and the counters as the difference.
export interface MigrationReport {
  dryRun: boolean;
  totalRows: number;
  alreadyMigrated: number;
  toMove: number;
  missingFiles: number;
  groups: { label: string; folder: string; count: number }[];
  // Two labels sanitizing to one folder would silently merge two stashes on
  // disk; the migration refuses to run while any exist.
  collisions: { folder: string; labels: string[] }[];
  freeBytes: number;
  requiredBytes: number;
  manifestPath: string | null;
  backupPath: string | null;
  moved: number;
  errors: string[];
}

export interface LibraryInfo {
  libraryPath: string;
  defaultLibraryPath: string;
  recent: string[];
  generations: number;
  groups: number;
  imageBytes: number;
  dbBytes: number;
  freeBytes: number;
  // True once every generation resolves inside stashes/ — i.e. the
  // per-group migration has been run and nothing is left in the flat
  // images/ directory.
  migrated: boolean;
}

export interface IntegrityResult {
  ok: boolean;
  detail: string;
}

export interface PerchanceStatus {
  connected: boolean;
  url?: string;
  error?: string;
}

export interface PromptLoomApi {
  listCategories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
  renameCategory(id: number, name: string): Promise<void>;
  deleteCategory(id: number): Promise<void>;

  listItems(): Promise<Item[]>;
  createItem(categoryId: number, name: string, promptFragment: string): Promise<Item>;
  updateItem(id: number, name: string, promptFragment: string): Promise<void>;
  deleteItem(id: number): Promise<void>;
  exportDefinitions(): Promise<string | null>;
  importDefinitions(): Promise<DefinitionsImportResult | null>;

  listGenerations(): Promise<Generation[]>;
  saveGeneration(
    batchLabel: string,
    promptText: string,
    selection: Record<number, number>,
    seed: string | null,
    imageDataUrl: string,
  ): Promise<Generation>;
  deleteGeneration(id: number): Promise<void>;
  deleteBatch(batchLabel: string): Promise<void>;
  renameBatch(oldLabel: string, newLabel: string): Promise<void>;
  saveGenerationAs(id: number): Promise<string | null>;

  getLibraryInfo(): Promise<LibraryInfo>;
  // Opens a folder picker. Returns the chosen path, and the app relaunches
  // onto it — swapping the SQLite handle and every renderer-held path live,
  // while a perchance save could be in flight, is not worth the risk.
  chooseLibrary(): Promise<string | null>;
  openLibrary(libraryPath: string): Promise<boolean>;
  planMigration(): Promise<MigrationReport>;
  runMigration(): Promise<MigrationReport>;
  rollbackMigration(): Promise<{ restored: number; errors: string[] } | null>;
  backupLibrary(): Promise<string | null>;
  checkIntegrity(): Promise<IntegrityResult>;

  populatePrompt(promptText: string): Promise<void>;
  getCurrentStash(): Promise<string>;
  setCurrentStash(name: string): Promise<void>;
  setPerchanceHidden(hidden: boolean): Promise<void>;
  onPerchanceStatus(callback: (status: PerchanceStatus) => void): () => void;
  onGenerationSaved(callback: (generation: Generation) => void): () => void;
  onGalleryAction(callback: (action: GalleryActionResult) => void): () => void;
}

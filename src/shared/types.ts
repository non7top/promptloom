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

  populatePrompt(promptText: string): Promise<void>;
  getCurrentStash(): Promise<string>;
  setCurrentStash(name: string): Promise<void>;
  setPerchanceHidden(hidden: boolean): Promise<void>;
  onPerchanceStatus(callback: (status: PerchanceStatus) => void): () => void;
  onGenerationSaved(callback: (generation: Generation) => void): () => void;
}

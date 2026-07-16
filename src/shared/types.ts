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

export interface PromptLoomApi {
  listCategories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
  renameCategory(id: number, name: string): Promise<void>;
  deleteCategory(id: number): Promise<void>;

  listItems(): Promise<Item[]>;
  createItem(categoryId: number, name: string, promptFragment: string): Promise<Item>;
  updateItem(id: number, name: string, promptFragment: string): Promise<void>;
  deleteItem(id: number): Promise<void>;

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
  saveGenerationAs(id: number): Promise<string | null>;
}

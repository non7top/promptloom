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

export interface PromptLoomApi {
  listCategories(): Promise<Category[]>;
  createCategory(name: string): Promise<Category>;
  renameCategory(id: number, name: string): Promise<void>;
  deleteCategory(id: number): Promise<void>;

  listItems(): Promise<Item[]>;
  createItem(categoryId: number, name: string, promptFragment: string): Promise<Item>;
  updateItem(id: number, name: string, promptFragment: string): Promise<void>;
  deleteItem(id: number): Promise<void>;
}

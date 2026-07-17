import type { Category, Generation, Item, PromptLoomApi } from '../shared/types';

// Design-preview only: lets the renderer run standalone in a plain browser
// (via `vite --config vite.renderer.config.ts`) with no Electron/IPC behind
// it, so CSS/layout changes can be checked without a full app rebuild. The
// real preload always defines window.promptloom before this module would
// ever be reached, so this never loads inside the packaged app.
function placeholderImage(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${color}"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

let nextCategoryId = 3;
let nextItemId = 4;
let nextGenerationId = 4;

const categories: Category[] = [
  { id: 1, name: 'Pose' },
  { id: 2, name: 'Clothes' },
];

const items: Item[] = [
  { id: 1, categoryId: 1, name: 'Sitting', promptFragment: 'sitting on the floor' },
  { id: 2, categoryId: 1, name: 'Standing', promptFragment: 'standing confidently' },
  { id: 3, categoryId: 2, name: 'Red dress', promptFragment: 'wearing a long red dress' },
];

const generations: Generation[] = [
  {
    id: 1,
    batchLabel: 'Demo stash',
    promptText:
      'painterly anime artwork, young beautiful girl, sitting on the floor, wearing a long red dress, masterpiece, exquisite lighting and composition',
    selection: {},
    seed: '123456789',
    imagePath: '',
    imageUrl: placeholderImage('#7aa2f7'),
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 2,
    batchLabel: 'Demo stash',
    promptText: 'short prompt example',
    selection: {},
    seed: null,
    imagePath: '',
    imageUrl: placeholderImage('#9ece6a'),
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 3,
    batchLabel: 'Another batch',
    promptText:
      'a very long prompt to check wrapping and the accordion, art in the style of atey ghailan, painterly anime style at pixiv, masterpiece digital painting',
    selection: {},
    seed: '42',
    imagePath: '',
    imageUrl: placeholderImage('#f7768e'),
    createdAt: new Date(0).toISOString(),
  },
];

export const mockApi: PromptLoomApi = {
  listCategories: async () => categories,
  createCategory: async (name) => {
    const category = { id: nextCategoryId++, name };
    categories.push(category);
    return category;
  },
  renameCategory: async (id, name) => {
    const category = categories.find((c) => c.id === id);
    if (category) category.name = name;
  },
  deleteCategory: async (id) => {
    const index = categories.findIndex((c) => c.id === id);
    if (index >= 0) categories.splice(index, 1);
  },

  listItems: async () => items,
  createItem: async (categoryId, name, promptFragment) => {
    const item = { id: nextItemId++, categoryId, name, promptFragment };
    items.push(item);
    return item;
  },
  updateItem: async (id, name, promptFragment) => {
    const item = items.find((i) => i.id === id);
    if (item) {
      item.name = name;
      item.promptFragment = promptFragment;
    }
  },
  deleteItem: async (id) => {
    const index = items.findIndex((i) => i.id === id);
    if (index >= 0) items.splice(index, 1);
  },

  listGenerations: async () => generations,
  saveGeneration: async (batchLabel, promptText, selection, seed) => {
    const generation: Generation = {
      id: nextGenerationId++,
      batchLabel,
      promptText,
      selection,
      seed,
      imagePath: '',
      imageUrl: placeholderImage('#e0af68'),
      createdAt: new Date(0).toISOString(),
    };
    generations.push(generation);
    return generation;
  },
  deleteGeneration: async (id) => {
    const index = generations.findIndex((g) => g.id === id);
    if (index >= 0) generations.splice(index, 1);
  },
  deleteBatch: async (batchLabel) => {
    for (let i = generations.length - 1; i >= 0; i -= 1) {
      if (generations[i].batchLabel === batchLabel) generations.splice(i, 1);
    }
  },
  renameBatch: async (oldLabel, newLabel) => {
    for (const generation of generations) {
      if (generation.batchLabel === oldLabel) generation.batchLabel = newLabel;
    }
  },
  saveGenerationAs: async () => null,

  populatePrompt: async () => undefined,
  setCurrentStash: async () => undefined,
  setPerchanceHidden: async () => undefined,
  onPerchanceStatus: (callback) => {
    callback({ connected: true, url: 'https://perchance.org/ai-text-to-image-generator' });
    return () => undefined;
  },
};

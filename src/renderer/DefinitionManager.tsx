import { useState } from 'react';
import type { Category, Item } from '../shared/types';

interface Props {
  categories: Category[];
  items: Item[];
  onChange: () => void;
}

export default function DefinitionManager({ categories, items, onChange }: Props) {
  const [newCategoryName, setNewCategoryName] = useState('');

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    await window.promptloom.createCategory(name);
    setNewCategoryName('');
    onChange();
  };

  const renameCategory = async (id: number, currentName: string) => {
    const name = window.prompt('Rename category', currentName)?.trim();
    if (!name || name === currentName) return;
    await window.promptloom.renameCategory(id, name);
    onChange();
  };

  const deleteCategory = async (id: number, name: string) => {
    if (!window.confirm(`Delete category "${name}" and all its items?`)) return;
    await window.promptloom.deleteCategory(id);
    onChange();
  };

  return (
    <div>
      <form onSubmit={addCategory}>
        <input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="New category (e.g. Pose)"
        />
        <button type="submit">Add</button>
      </form>

      {categories.map((category) => (
        <CategorySection
          key={category.id}
          category={category}
          items={items.filter((item) => item.categoryId === category.id)}
          onRename={() => renameCategory(category.id, category.name)}
          onDelete={() => deleteCategory(category.id, category.name)}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function CategorySection({
  category,
  items,
  onRename,
  onDelete,
  onChange,
}: {
  category: Category;
  items: Item[];
  onRename: () => void;
  onDelete: () => void;
  onChange: () => void;
}) {
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrompt, setNewItemPrompt] = useState('');

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItemName.trim();
    const promptFragment = newItemPrompt.trim();
    if (!name || !promptFragment) return;
    await window.promptloom.createItem(category.id, name, promptFragment);
    setNewItemName('');
    setNewItemPrompt('');
    onChange();
  };

  const editItem = async (item: Item) => {
    const name = window.prompt('Item name', item.name)?.trim();
    if (!name) return;
    const promptFragment = window.prompt('Prompt fragment', item.promptFragment)?.trim();
    if (!promptFragment) return;
    await window.promptloom.updateItem(item.id, name, promptFragment);
    onChange();
  };

  const deleteItem = async (item: Item) => {
    if (!window.confirm(`Delete item "${item.name}"?`)) return;
    await window.promptloom.deleteItem(item.id);
    onChange();
  };

  return (
    <section className="category">
      <header>
        <strong>{category.name}</strong>
        <button onClick={onRename}>Rename</button>
        <button onClick={onDelete}>Delete</button>
      </header>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span>
              {item.name}: <em>{item.promptFragment}</em>
            </span>
            <button onClick={() => editItem(item)}>Edit</button>
            <button onClick={() => deleteItem(item)}>Delete</button>
          </li>
        ))}
      </ul>
      <form onSubmit={addItem}>
        <input
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Item name"
        />
        <input
          value={newItemPrompt}
          onChange={(e) => setNewItemPrompt(e.target.value)}
          placeholder="Prompt fragment"
        />
        <button type="submit">Add item</button>
      </form>
    </section>
  );
}

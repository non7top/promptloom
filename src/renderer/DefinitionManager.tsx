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

  return (
    <div>
      <form onSubmit={addCategory}>
        <input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="New category (e.g. Pose)"
        />
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>

      {categories.map((category) => (
        <CategorySection
          key={category.id}
          category={category}
          items={items.filter((item) => item.categoryId === category.id)}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function CategorySection({
  category,
  items,
  onChange,
}: {
  category: Category;
  items: Item[];
  onChange: () => void;
}) {
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrompt, setNewItemPrompt] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(category.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPromptFragment, setEditPromptFragment] = useState('');
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

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

  const saveRename = async () => {
    const name = renameValue.trim();
    if (!name) return;
    if (name !== category.name) {
      await window.promptloom.renameCategory(category.id, name);
      onChange();
    }
    setRenaming(false);
  };

  const confirmDeleteCategory = async () => {
    await window.promptloom.deleteCategory(category.id);
    onChange();
  };

  const startEditItem = (item: Item) => {
    setEditingItemId(item.id);
    setEditName(item.name);
    setEditPromptFragment(item.promptFragment);
  };

  const saveEditItem = async (item: Item) => {
    const name = editName.trim();
    const promptFragment = editPromptFragment.trim();
    if (!name || !promptFragment) return;
    await window.promptloom.updateItem(item.id, name, promptFragment);
    setEditingItemId(null);
    onChange();
  };

  const confirmDeleteItem = async (item: Item) => {
    await window.promptloom.deleteItem(item.id);
    setDeletingItemId(null);
    onChange();
  };

  return (
    <section className="category">
      <header>
        {renaming ? (
          <>
            <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
            <button onClick={saveRename}>Save</button>
            <button onClick={() => setRenaming(false)}>Cancel</button>
          </>
        ) : (
          <>
            <strong>{category.name}</strong>
            <button
              onClick={() => {
                setRenameValue(category.name);
                setRenaming(true);
              }}
            >
              Rename
            </button>
            {confirmingDelete ? (
              <>
                <span className="hint">Delete category and all its items?</span>
                <button className="btn-danger-strong" onClick={confirmDeleteCategory}>
                  Yes
                </button>
                <button onClick={() => setConfirmingDelete(false)}>No</button>
              </>
            ) : (
              <button className="btn-danger-mild" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            )}
          </>
        )}
      </header>
      <ul className="item-list">
        {items.map((item) =>
          editingItemId === item.id ? (
            <li key={item.id}>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
              <input
                value={editPromptFragment}
                onChange={(e) => setEditPromptFragment(e.target.value)}
              />
              <button onClick={() => saveEditItem(item)}>Save</button>
              <button onClick={() => setEditingItemId(null)}>Cancel</button>
            </li>
          ) : (
            <li key={item.id}>
              <span>
                {item.name}: <em>{item.promptFragment}</em>
              </span>
              <button onClick={() => startEditItem(item)}>Edit</button>
              {deletingItemId === item.id ? (
                <>
                  <button className="btn-danger-mild" onClick={() => confirmDeleteItem(item)}>
                    Confirm delete
                  </button>
                  <button onClick={() => setDeletingItemId(null)}>Cancel</button>
                </>
              ) : (
                <button className="btn-danger-mild" onClick={() => setDeletingItemId(item.id)}>
                  Delete
                </button>
              )}
            </li>
          ),
        )}
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
        <button type="submit" className="btn-primary">
          Add item
        </button>
      </form>
    </section>
  );
}

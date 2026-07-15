import { useMemo, useState } from 'react';
import type { Category, Item } from '../shared/types';

interface Props {
  categories: Category[];
  items: Item[];
}

export default function Composer({ categories, items }: Props) {
  const [selected, setSelected] = useState<Record<number, Set<number>>>({});

  const toggleItem = (categoryId: number, itemId: number) => {
    setSelected((prev) => {
      const current = new Set(prev[categoryId] ?? []);
      if (current.has(itemId)) {
        current.delete(itemId);
      } else {
        current.add(itemId);
      }
      return { ...prev, [categoryId]: current };
    });
  };

  const categoriesWithItems = categories.filter((category) =>
    items.some((item) => item.categoryId === category.id),
  );

  const combinationCount = useMemo(() => {
    return categoriesWithItems.reduce((total, category) => {
      const count = selected[category.id]?.size ?? 0;
      return total * count;
    }, 1);
  }, [categoriesWithItems, selected]);

  const readyToRun = categoriesWithItems.length > 0 && combinationCount > 0;

  return (
    <div>
      {categoriesWithItems.length === 0 && (
        <p className="hint">Add some categories and items in Definitions first.</p>
      )}
      {categoriesWithItems.map((category) => (
        <section className="category" key={category.id}>
          <header>
            <strong>{category.name}</strong>
          </header>
          <ul>
            {items
              .filter((item) => item.categoryId === category.id)
              .map((item) => (
                <li key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected[category.id]?.has(item.id) ?? false}
                      onChange={() => toggleItem(category.id, item.id)}
                    />
                    {item.name}
                  </label>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <p>
        {readyToRun
          ? `${combinationCount} combination${combinationCount === 1 ? '' : 's'} queued`
          : 'Select at least one item in every category to queue a batch.'}
      </p>
      <button disabled title="Browser driving isn't wired up yet">
        Start batch
      </button>
    </div>
  );
}

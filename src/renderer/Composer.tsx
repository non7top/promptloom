import { useMemo, useState } from 'react';
import type { Category, Item } from '../shared/types';
import { generateImage } from './perchanceDriver';

interface Props {
  categories: Category[];
  items: Item[];
}

function cartesianProduct(
  categories: Category[],
  selected: Record<number, Set<number>>,
): Record<number, number>[] {
  return categories.reduce<Record<number, number>[]>((acc, category) => {
    const itemIds = Array.from(selected[category.id] ?? []);
    if (itemIds.length === 0) return acc;
    if (acc.length === 0) return itemIds.map((itemId) => ({ [category.id]: itemId }));
    return acc.flatMap((combo) => itemIds.map((itemId) => ({ ...combo, [category.id]: itemId })));
  }, []);
}

export default function Composer({ categories, items }: Props) {
  const [selected, setSelected] = useState<Record<number, Set<number>>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

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

  const startBatch = async () => {
    const webview = document.getElementById('generator') as Electron.WebviewTag | null;
    if (!webview) {
      setError('Generator webview not found');
      return;
    }

    const combos = cartesianProduct(categoriesWithItems, selected);
    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: combos.length });

    for (const combo of combos) {
      const comboItems = categoriesWithItems
        .map((category) => items.find((item) => item.id === combo[category.id]))
        .filter((item): item is Item => Boolean(item));
      const promptText = comboItems.map((item) => item.promptFragment).join(', ');
      const groupLabel = comboItems.map((item) => item.name).join(' - ') || 'Unsorted';

      try {
        // eslint-disable-next-line no-await-in-loop -- generations must run sequentially, one page at a time
        const result = await generateImage(webview, promptText);
        // eslint-disable-next-line no-await-in-loop
        await window.promptloom.saveGeneration(
          groupLabel,
          result.capturedPrompt ?? promptText,
          combo,
          result.seed,
          result.imageDataUrl,
        );
        setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        break;
      }
    }

    setRunning(false);
  };

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
      {running && (
        <p className="hint">
          Running {progress.done}/{progress.total}...
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button onClick={startBatch} disabled={!readyToRun || running}>
        Start batch
      </button>
    </div>
  );
}

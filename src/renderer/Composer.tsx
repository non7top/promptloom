import { useMemo, useState } from 'react';
import type { Category, Item } from '../shared/types';

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
  const [stashName, setStashName] = useState('');
  const [seed, setSeed] = useState('');
  const [combos, setCombos] = useState<Record<number, number>[] | null>(null);
  const [comboIndex, setComboIndex] = useState(0);
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

  // Each chunk gets a `// Category` comment line ahead of its fragment,
  // right in the prompt that's actually populated into perchance. That
  // prompt is also what gets read back and stored verbatim (sidecar .txt,
  // Gallery tooltip) once an image is saved, so the comments are what make
  // it possible to tell which category contributed what chunk later,
  // without a separate on-screen breakdown.
  const plainPromptFor = (combo: Record<number, number>): string =>
    categoriesWithItems
      .map((category) => {
        const item = items.find((candidate) => candidate.id === combo[category.id]);
        return item?.promptFragment ? `// ${category.name}\n${item.promptFragment}` : null;
      })
      .filter((section): section is string => Boolean(section))
      .join('\n\n');

  const populate = async (combo: Record<number, number>) => {
    try {
      await window.promptloom.populatePrompt(plainPromptFor(combo));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const start = async () => {
    const name = stashName.trim() || `Stash ${new Date().toLocaleString()}`;
    setStashName(name);
    await window.promptloom.setCurrentStash(name);
    const generated = cartesianProduct(categoriesWithItems, selected);
    setCombos(generated);
    setComboIndex(0);
    await populate(generated[0]);
  };

  const next = async () => {
    if (!combos) return;
    const nextIndex = comboIndex + 1;
    if (nextIndex >= combos.length) return;
    setComboIndex(nextIndex);
    await populate(combos[nextIndex]);
  };

  const stop = () => {
    setCombos(null);
    setError(null);
  };

  return (
    <div>
      <input
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
        placeholder="Seed (optional, appended to the prompt)"
        disabled={combos !== null}
      />

      {categoriesWithItems.length === 0 && (
        <p className="hint">Add some categories and items in Definitions first.</p>
      )}
      {categoriesWithItems.map((category) => (
        <section className="category" key={category.id}>
          <header>
            <strong>{category.name}</strong>
          </header>
          <ul className="item-list">
            {items
              .filter((item) => item.categoryId === category.id)
              .map((item) => (
                <li key={item.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected[category.id]?.has(item.id) ?? false}
                      onChange={() => toggleItem(category.id, item.id)}
                      disabled={combos !== null}
                    />
                    {item.name}
                  </label>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <input
        value={stashName}
        onChange={(e) => setStashName(e.target.value)}
        placeholder="Stash name (e.g. Hermione outfits)"
        disabled={combos !== null}
      />

      {combos === null ? (
        <>
          <p>
            {readyToRun
              ? `${combinationCount} combination${combinationCount === 1 ? '' : 's'} ready`
              : 'Select at least one item in every category to start.'}
          </p>
          <button className="btn-primary" onClick={start} disabled={!readyToRun}>
            Start
          </button>
        </>
      ) : (
        <>
          <p>
            Combination {comboIndex + 1} of {combos.length}
          </p>
          <p className="hint">
            Prompt populated on the page — click Generate there yourself, then click perchance&apos;s
            own 🛡️💾 save button under any image you want to keep. Saved images land in the
            Gallery under &quot;{stashName}&quot;.
          </p>
          <button onClick={next} disabled={comboIndex + 1 >= combos.length}>
            Populate next prompt
          </button>
          <button onClick={stop}>Stop</button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { Category, Item } from '../shared/types';
import { filterByQuery } from './TagFilter';

interface Props {
  categories: Category[];
  items: Item[];
  onStashChange?: (name: string) => void;
  // Find-as-you-type query; owned by App, since the input itself lives in
  // the sidebar header shared by this tab and Definitions.
  filter: string;
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

export default function Composer({ categories, items, onStashChange, filter }: Props) {
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

  // Display-only: the run itself still spans every selected tag, including
  // ones the current query hides. The per-category "n selected" count below
  // is what keeps those hidden selections from being invisible.
  const visible = filterByQuery(categoriesWithItems, items, filter);

  // The seed field may already hold perchance's own `(seed:::N)` syntax —
  // e.g. pasted from Gallery's "Copy seed" button — rather than a bare
  // number, so don't blindly re-wrap an already-formatted value.
  const formattedSeed = (raw: string): string => {
    const trimmed = raw.trim();
    return /^\(seed:::.*\)$/.test(trimmed) ? trimmed : `(seed:::${trimmed})`;
  };

  // Each chunk gets a `// Category:Item` comment line ahead of its
  // fragment, right in the prompt that's actually populated into perchance.
  // That prompt is also what gets read back and stored verbatim (sidecar
  // .txt, Gallery tooltip) once an image is saved, so naming the exact item
  // (not just its category) is what makes a saved prompt re-importable —
  // reconstructing the selection later doesn't depend on matching fragment
  // text back to an item.
  const plainPromptFor = (combo: Record<number, number>): string => {
    const sections = categoriesWithItems
      .map((category) => {
        const item = items.find((candidate) => candidate.id === combo[category.id]);
        return item?.promptFragment ? `// ${category.name}:${item.name}\n${item.promptFragment}` : null;
      })
      .filter((section): section is string => Boolean(section));
    const body = sections.join('\n\n');
    return seed.trim() ? `${body}\n\n${formattedSeed(seed)}` : body;
  };

  const populate = async (combo: Record<number, number>) => {
    try {
      await window.promptloom.populatePrompt(plainPromptFor(combo));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const start = async () => {
    const name = stashName.trim() || new Date().toISOString().slice(0, 10);
    setStashName(name);
    await window.promptloom.setCurrentStash(name);
    onStashChange?.(name);
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
      {visible.length === 0 && filter.trim() && <p className="hint">No tags match “{filter}”.</p>}
      {visible.map(({ category, items: categoryItems }) => {
        const selectedCount = selected[category.id]?.size ?? 0;
        return (
          <section className="category" key={category.id}>
            <header>
              <strong>{category.name}</strong>
              {selectedCount > 0 && <span className="hint">{selectedCount} selected</span>}
            </header>
            <ul className="item-list">
              {categoryItems.map((item) => (
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
        );
      })}

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

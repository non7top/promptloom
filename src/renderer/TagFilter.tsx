import type { Category, Item } from '../shared/types';

export interface FilteredCategory {
  category: Category;
  items: Item[];
}

// Find-as-you-type over the sidebar's tag lists (Definitions and Composer).
// A query matching a category's own name keeps every tag under it, so typing
// "pose" is also a way to narrow down to one category without every tag name
// having to repeat its category. Prompt fragments are matched too — the tag
// you're after is often remembered by the words that end up in the prompt
// ("freckles") rather than by whatever the item was named.
export function filterByQuery(
  categories: Category[],
  items: Item[],
  query: string,
): FilteredCategory[] {
  const needle = query.trim().toLowerCase();
  return categories
    .map((category) => {
      const own = items.filter((item) => item.categoryId === category.id);
      if (!needle || category.name.toLowerCase().includes(needle)) {
        return { category, items: own, matched: true };
      }
      const hits = own.filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          item.promptFragment.toLowerCase().includes(needle),
      );
      // While filtering, a category none of whose tags matched is just
      // noise — drop the whole card rather than showing an empty one.
      return { category, items: hits, matched: hits.length > 0 };
    })
    .filter((entry) => entry.matched)
    .map(({ category, items: matchedItems }) => ({ category, items: matchedItems }));
}

export function countItems(entries: FilteredCategory[]): number {
  return entries.reduce((total, entry) => total + entry.items.length, 0);
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  matchCount: number;
  totalCount: number;
}

export default function TagFilter({ value, onChange, matchCount, totalCount }: Props) {
  const active = value.trim().length > 0;
  return (
    <div className="tag-filter">
      {/* type="search" for Chromium's built-in clear affordance; Escape
          clears too, so the filter can be dropped without leaving the
          keyboard mid-typing. */}
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('');
        }}
        placeholder="Find tag…"
        aria-label="Find tag"
      />
      {active && (
        <span className="hint">
          {matchCount}/{totalCount}
        </span>
      )}
    </div>
  );
}

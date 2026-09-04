import { useEffect, useState } from 'react';
import type { Category, Item } from '../shared/types';
import DefinitionManager from './DefinitionManager';
import Composer from './Composer';
import Gallery from './Gallery';
import TagFilter, { countItems, filterByQuery } from './TagFilter';

type Tab = 'definitions' | 'composer' | 'gallery';

export default function App() {
  const [tab, setTab] = useState<Tab>('definitions');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [activeStash, setActiveStash] = useState('');
  // Owned here rather than per-tab: the input sits in the sticky header, and
  // both Definitions and Composer list the same tags, so a query typed while
  // picking tags survives a hop over to Definitions to edit one of them.
  const [tagFilter, setTagFilter] = useState('');

  const reload = async () => {
    const [nextCategories, nextItems] = await Promise.all([
      window.promptloom.listCategories(),
      window.promptloom.listItems(),
    ]);
    setCategories(nextCategories);
    setItems(nextItems);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is redefined every render (not memoized), so listing it would re-run this on every render instead of once on mount, which is what's intended here.
  useEffect(() => {
    // Initial IPC data load on mount, not a subscription to an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    // Composer sets this when a batch run starts, but images saved from a
    // prompt typed straight into perchance (no Composer run at all) land
    // wherever this already was — load its current value rather than
    // assuming 'Unsorted', so this control reflects reality on open.
    window.promptloom.getCurrentStash().then(setActiveStash);
  }, []);

  const updateActiveStash = (name: string) => {
    setActiveStash(name);
    window.promptloom.setCurrentStash(name);
  };

  useEffect(() => {
    // #sidebar is static markup in index.html, outside this component's own
    // root, so its width toggle is applied directly rather than through JSX.
    document.getElementById('sidebar')?.classList.toggle('sidebar-expanded', rightPanelCollapsed);
    window.promptloom.setPerchanceHidden(rightPanelCollapsed);
  }, [rightPanelCollapsed]);

  return (
    <div>
      {/* Sticky as one unit (not each element separately) so both stay
          pinned to the top of #sidebar's scroll regardless of how tall the
          active tab's content gets — a long Gallery shouldn't scroll the
          tabs or "Saving to" out of view. */}
      <div className="sidebar-header">
        <nav className="tabs">
          <button
            className={tab === 'definitions' ? 'active' : ''}
            onClick={() => setTab('definitions')}
          >
            Definitions
          </button>
          <button
            className={tab === 'composer' ? 'active' : ''}
            onClick={() => setTab('composer')}
          >
            Composer
          </button>
          <button className={tab === 'gallery' ? 'active' : ''} onClick={() => setTab('gallery')}>
            Gallery
          </button>
          <button
            className="tab-collapse"
            title={rightPanelCollapsed ? 'Show perchance panel' : 'Collapse right panel'}
            onClick={() => setRightPanelCollapsed((v) => !v)}
          >
            {rightPanelCollapsed ? '⇤' : '⇥'}
          </button>
        </nav>
        {/* Composer sets this automatically when starting a batch, but
            prompts typed directly into perchance (no Composer run at all)
            need somewhere to set it manually — always visible, not tied to
            any one tab, since perchance's own save button can fire from
            whichever tab happens to be open. */}
        <div className="active-stash">
          <label htmlFor="active-stash-input">Saving to</label>
          <input
            id="active-stash-input"
            value={activeStash}
            onChange={(e) => updateActiveStash(e.target.value)}
            placeholder="Unsorted"
          />
        </div>
        {/* Only the tag-listing tabs — the Gallery lists stashes of images,
            which this query has nothing to say about. */}
        {tab !== 'gallery' && items.length > 0 && (
          <TagFilter
            value={tagFilter}
            onChange={setTagFilter}
            matchCount={countItems(filterByQuery(categories, items, tagFilter))}
            totalCount={items.length}
          />
        )}
      </div>
      {tab === 'definitions' && (
        <DefinitionManager
          categories={categories}
          items={items}
          onChange={reload}
          filter={tagFilter}
        />
      )}
      {/* Kept mounted (rather than conditionally rendered like the other
          tabs) so switching away and back doesn't lose the in-progress
          checkbox selection, seed, or running combo. */}
      <div style={{ display: tab === 'composer' ? 'block' : 'none' }}>
        <Composer
          categories={categories}
          items={items}
          onStashChange={setActiveStash}
          filter={tagFilter}
        />
      </div>
      {tab === 'gallery' && <Gallery />}
    </div>
  );
}

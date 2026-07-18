import { useEffect, useState } from 'react';
import type { Category, Item } from '../shared/types';
import DefinitionManager from './DefinitionManager';
import Composer from './Composer';
import Gallery from './Gallery';

type Tab = 'definitions' | 'composer' | 'gallery';

export default function App() {
  const [tab, setTab] = useState<Tab>('definitions');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const reload = async () => {
    const [nextCategories, nextItems] = await Promise.all([
      window.promptloom.listCategories(),
      window.promptloom.listItems(),
    ]);
    setCategories(nextCategories);
    setItems(nextItems);
  };

  useEffect(() => {
    // Initial IPC data load on mount, not a subscription to an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  useEffect(() => {
    // #sidebar is static markup in index.html, outside this component's own
    // root, so its width toggle is applied directly rather than through JSX.
    document.getElementById('sidebar')?.classList.toggle('sidebar-expanded', rightPanelCollapsed);
    window.promptloom.setPerchanceHidden(rightPanelCollapsed);
  }, [rightPanelCollapsed]);

  return (
    <div>
      <nav className="tabs">
        <button
          className={tab === 'definitions' ? 'active' : ''}
          onClick={() => setTab('definitions')}
        >
          Definitions
        </button>
        <button className={tab === 'composer' ? 'active' : ''} onClick={() => setTab('composer')}>
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
      {tab === 'definitions' && (
        <DefinitionManager categories={categories} items={items} onChange={reload} />
      )}
      {/* Kept mounted (rather than conditionally rendered like the other
          tabs) so switching away and back doesn't lose the in-progress
          checkbox selection, seed, or running combo. */}
      <div style={{ display: tab === 'composer' ? 'block' : 'none' }}>
        <Composer categories={categories} items={items} />
      </div>
      {tab === 'gallery' && <Gallery />}
    </div>
  );
}

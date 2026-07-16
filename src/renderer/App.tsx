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
  const [perchanceStatus, setPerchanceStatus] = useState('Connecting...');

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
    return window.promptloom.onPerchanceStatus((status) => {
      setPerchanceStatus(
        status.connected ? `Connected: ${status.url}` : `Failed to load (${status.error})`,
      );
    });
  }, []);

  return (
    <div>
      <h1>PromptLoom</h1>
      <p className="hint">{perchanceStatus}</p>
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
      </nav>
      {tab === 'definitions' && (
        <DefinitionManager categories={categories} items={items} onChange={reload} />
      )}
      {tab === 'composer' && <Composer categories={categories} items={items} />}
      {tab === 'gallery' && <Gallery />}
    </div>
  );
}

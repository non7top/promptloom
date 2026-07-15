import { useEffect, useState } from 'react';
import type { Category, Item } from '../shared/types';
import DefinitionManager from './DefinitionManager';
import Composer from './Composer';

type Tab = 'definitions' | 'composer';

export default function App() {
  const [tab, setTab] = useState<Tab>('definitions');
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [webviewStatus, setWebviewStatus] = useState('Connecting...');

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
    const webview = document.getElementById('generator') as Electron.WebviewTag | null;
    if (!webview) return;

    const onReady = () => setWebviewStatus(`Connected: ${webview.getURL()}`);
    const onFail = (event: Electron.DidFailLoadEvent) =>
      setWebviewStatus(`Failed to load (${event.errorDescription})`);

    webview.addEventListener('dom-ready', onReady);
    webview.addEventListener('did-fail-load', onFail);
    return () => {
      webview.removeEventListener('dom-ready', onReady);
      webview.removeEventListener('did-fail-load', onFail);
    };
  }, []);

  return (
    <div>
      <h1>PromptLoom</h1>
      <p className="hint">{webviewStatus}</p>
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
      </nav>
      {tab === 'definitions' ? (
        <DefinitionManager categories={categories} items={items} onChange={reload} />
      ) : (
        <Composer categories={categories} items={items} />
      )}
    </div>
  );
}

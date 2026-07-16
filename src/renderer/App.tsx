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

  useEffect(() => {
    const webview = document.getElementById('generator') as Electron.WebviewTag | null;
    if (!webview) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      const next = Math.min(Math.max(webview.getZoomFactor() + delta, 0.25), 3);
      webview.setZoomFactor(next);
    };

    const target = webview as unknown as HTMLElement;
    target.addEventListener('wheel', onWheel, { passive: false });
    return () => target.removeEventListener('wheel', onWheel);
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

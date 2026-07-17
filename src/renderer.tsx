import { createRoot } from 'react-dom/client';
import './index.css';
import App from './renderer/App';
import { mockApi } from './renderer/mockApi';

// Only present when running the renderer standalone in a plain browser for
// design preview — the real preload always defines this before the packaged
// app's renderer script runs.
if (!window.promptloom) {
  window.promptloom = mockApi;
}

const container = document.getElementById('sidebar-root');
if (!container) {
  throw new Error('sidebar-root element not found');
}

createRoot(container).render(<App />);

import { createRoot } from 'react-dom/client';
import './index.css';
import App from './renderer/App';

const container = document.getElementById('sidebar-root');
if (!container) {
  throw new Error('sidebar-root element not found');
}

createRoot(container).render(<App />);

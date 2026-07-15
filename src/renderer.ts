import './index.css';

const webview = document.getElementById('generator') as Electron.WebviewTag;
const status = document.getElementById('status');

webview.addEventListener('dom-ready', () => {
  if (status) status.textContent = `Connected: ${webview.getURL()}`;
});

webview.addEventListener('did-fail-load', (event) => {
  if (status) status.textContent = `Failed to load (${event.errorDescription})`;
});

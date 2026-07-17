import { BrowserWindow, WebContentsView, session, WebContents } from 'electron';
import path from 'node:path';
import type { PerchanceStatus } from '../shared/types';

const PERCHANCE_URL = 'https://perchance.org/ai-text-to-image-generator';
export const SIDEBAR_WIDTH = 380;

let view: WebContentsView | undefined;
let lastStatus: PerchanceStatus = { connected: false };

export function createPerchanceView(mainWindow: BrowserWindow): WebContentsView {
  const newView = new WebContentsView({
    webPreferences: {
      session: session.fromPartition('persist:perchance'),
      preload: path.join(__dirname, 'perchancePreload.js'),
    },
  });
  view = newView;
  mainWindow.contentView.addChildView(newView);
  newView.webContents.loadURL(PERCHANCE_URL);

  // Unlike a top-level BrowserWindow, a WebContentsView doesn't apply
  // Ctrl+scroll-wheel zoom automatically — 'zoom-changed' fires the request,
  // but applying it is left to the app.
  newView.webContents.on('zoom-changed', (_event, zoomDirection) => {
    const current = newView.webContents.getZoomFactor();
    const delta = zoomDirection === 'in' ? 0.1 : -0.1;
    newView.webContents.setZoomFactor(Math.min(Math.max(current + delta, 0.25), 3));
  });

  const updateBounds = () => {
    const [width, height] = mainWindow.getContentSize();
    newView.setBounds({
      x: SIDEBAR_WIDTH,
      y: 0,
      width: Math.max(width - SIDEBAR_WIDTH, 0),
      height,
    });
  };
  updateBounds();
  mainWindow.on('resize', updateBounds);

  return newView;
}

export function getPerchanceWebContents(): WebContents {
  if (!view) {
    throw new Error('Perchance view has not been created yet');
  }
  return view.webContents;
}

// The renderer's status listener may subscribe after the view has already
// fired its first load event — cache the latest status so a fresh
// subscriber can query it instead of missing that event.
export function getLastPerchanceStatus(): PerchanceStatus {
  return lastStatus;
}

export function setLastPerchanceStatus(status: PerchanceStatus): void {
  lastStatus = status;
}

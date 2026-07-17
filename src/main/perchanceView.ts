import { BrowserWindow, WebContentsView, session, WebContents } from 'electron';
import path from 'node:path';
import type { PerchanceStatus } from '../shared/types';

const PERCHANCE_URL = 'https://perchance.org/ai-text-to-image-generator';
export const SIDEBAR_WIDTH = 380;

let view: WebContentsView | undefined;
let lastStatus: PerchanceStatus = { connected: false };
let mainWindowRef: BrowserWindow | undefined;
let hidden = false;

function computeBounds(mainWindow: BrowserWindow) {
  const [width, height] = mainWindow.getContentSize();
  return {
    x: SIDEBAR_WIDTH,
    y: 0,
    width: Math.max(width - SIDEBAR_WIDTH, 0),
    height,
  };
}

export function createPerchanceView(mainWindow: BrowserWindow): WebContentsView {
  const newView = new WebContentsView({
    webPreferences: {
      session: session.fromPartition('persist:perchance'),
      preload: path.join(__dirname, 'perchancePreload.js'),
      // The generator itself lives in a nested <iframe>, not the top-level
      // frame — Electron only loads a preload script into the main frame
      // by default, so window.promptloomBridge would otherwise never exist
      // where the save-button listener actually needs it.
      nodeIntegrationInSubFrames: true,
    },
  });
  view = newView;
  mainWindowRef = mainWindow;
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
    // Skip while hidden — otherwise a resize while a lightbox is open would
    // reassert the view's real bounds and pop it back on top.
    if (hidden) return;
    newView.setBounds(computeBounds(mainWindow));
  };
  updateBounds();
  mainWindow.on('resize', updateBounds);

  return newView;
}

// The perchance view is a separate native compositor layer, always drawn on
// top of the sidebar's own web contents regardless of DOM z-index — so a
// sidebar overlay (e.g. the image lightbox) that's meant to cover the whole
// window has to hide this out of the way first, then restore it after.
export function setPerchanceViewHidden(nextHidden: boolean): void {
  if (!view || !mainWindowRef) return;
  hidden = nextHidden;
  if (hidden) {
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  } else {
    view.setBounds(computeBounds(mainWindowRef));
  }
}

export function getPerchanceWebContents(): WebContents {
  if (!view) {
    throw new Error('Perchance view has not been created yet');
  }
  return view.webContents;
}

// Right-click "Inspect Element" doesn't currently work for this view — this
// gives a way to open its DevTools anyway, e.g. to see console output/
// errors from the injected save-button script, or to run diagnostic JS by
// hand against the real page.
export function openPerchanceDevTools(): void {
  getPerchanceWebContents().openDevTools({ mode: 'detach' });
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

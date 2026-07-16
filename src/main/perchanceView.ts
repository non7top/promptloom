import { BrowserWindow, WebContentsView, session, WebContents } from 'electron';
import type { PerchanceStatus } from '../shared/types';

const PERCHANCE_URL = 'https://perchance.org/ai-text-to-image-generator';
export const SIDEBAR_WIDTH = 380;

let view: WebContentsView | undefined;
let lastStatus: PerchanceStatus = { connected: false };

export function createPerchanceView(mainWindow: BrowserWindow): WebContentsView {
  const newView = new WebContentsView({
    webPreferences: {
      session: session.fromPartition('persist:perchance'),
    },
  });
  view = newView;
  mainWindow.contentView.addChildView(newView);
  newView.webContents.loadURL(PERCHANCE_URL);

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

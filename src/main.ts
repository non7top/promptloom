import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import contextMenu from 'electron-context-menu';
import { initDb } from './main/db';
import { registerIpcHandlers } from './main/ipc';
import { createPerchanceView, openPerchanceDevTools, setLastPerchanceStatus } from './main/perchanceView';
import { injectSaveButtons } from './main/perchanceDriver';
import type { PerchanceStatus } from './shared/types';

// Electron shows no right-click menu anywhere by default (unlike a normal
// browser) — this adds the standard cut/copy/paste/inspect-element menu,
// including inside the embedded perchance view.
contextMenu({
  showInspectElement: true,
});

// Container/Xvfb dev environments often can't launch any GPU process at all
// (even for software rasterization); only opt out there, not in the real
// packaged app.
if (process.env.PROMPTLOOM_DISABLE_GPU) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-software-rasterizer');
}

// Opt-in only — this opens an unauthenticated CDP endpoint that lets any
// local process (or, if tunneled/forwarded, anything upstream of that
// tunnel) fully control the app. Only for use while actively debugging.
if (process.env.PROMPTLOOM_REMOTE_DEBUGGING_PORT) {
  app.commandLine.appendSwitch(
    'remote-debugging-port',
    process.env.PROMPTLOOM_REMOTE_DEBUGGING_PORT,
  );
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
    },
  });

  // and load the index.html of the app. electron-vite sets
  // ELECTRON_RENDERER_URL in dev (HMR dev server); in a packaged build it's
  // unset and the renderer is loaded from its built output instead.
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Right-click "Inspect Element" doesn't work inside the perchance
  // WebContentsView, and Electron's default "Toggle Developer Tools" menu
  // role only targets the focused BrowserWindow's own webContents (this
  // app's UI), not a child WebContentsView — so replace the default menu
  // with one that also exposes DevTools for the perchance panel directly.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Debug',
        submenu: [
          {
            label: 'Open Perchance DevTools',
            click: () => openPerchanceDevTools(),
          },
        ],
      },
    ]),
  );

  const perchanceView = createPerchanceView(mainWindow);
  const sendStatus = (status: PerchanceStatus) => {
    setLastPerchanceStatus(status);
    mainWindow.webContents.send('perchance:status', status);
  };
  perchanceView.webContents.on('did-finish-load', () => {
    sendStatus({ connected: true, url: perchanceView.webContents.getURL() });
  });
  // The generator itself typically lives in a nested iframe that finishes
  // loading independently of (and often after) the top-level page — and
  // often well after the user finishes manually clearing the Cloudflare
  // check, which did-finish-load alone can't account for. did-frame-
  // finish-load fires for every frame, main or sub, whenever any of them
  // navigates, so retry injection each time.
  perchanceView.webContents.on('did-frame-finish-load', () => {
    injectSaveButtons();
  });
  perchanceView.webContents.on('did-fail-load', (_event, _code, errorDescription, _url, isMainFrame) => {
    // did-fail-load fires for any failed resource (ads, trackers, fonts,
    // subframes), not just the page itself — only surface this as a real
    // failure when the main frame is what failed.
    if (!isMainFrame) return;
    sendStatus({ connected: false, error: errorDescription });
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  initDb(app.getPath('userData'));
  registerIpcHandlers();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

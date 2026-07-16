import { contextBridge, ipcRenderer } from 'electron';

// Preload for the embedded perchance WebContentsView (separate from the
// app's own preload). Exposes a minimal bridge so an injected save button
// can hand a specific image's src/title back to the main process without
// needing any other access to Node/Electron APIs.
contextBridge.exposeInMainWorld('promptloomBridge', {
  saveImage: (src: string, title: string) => ipcRenderer.send('perchance:saveImage', src, title),
});

import { contextBridge, ipcRenderer } from 'electron';

// Preload for the embedded perchance WebContentsView (separate from the
// app's own preload). Exposes a minimal bridge so the wrapped save
// function can hand a specific image's data/prompt/seed back to the main
// process without needing any other access to Node/Electron APIs.
contextBridge.exposeInMainWorld('promptloomBridge', {
  saveImage: (imageDataUrl: string, prompt: string, seed: string | null) =>
    ipcRenderer.send('perchance:saveImage', imageDataUrl, prompt, seed),
});

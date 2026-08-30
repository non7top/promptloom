import { contextBridge, ipcRenderer } from 'electron';

// Preload for the embedded perchance WebContentsView (separate from the
// app's own preload). Exposes a minimal bridge so the wrapped save
// function can hand a specific image's data/prompt/seed back to the main
// process without needing any other access to Node/Electron APIs.
contextBridge.exposeInMainWorld('promptloomBridge', {
  saveImage: (imageDataUrl: string, prompt: string, seed: string | null) =>
    ipcRenderer.send('perchance:saveImage', imageDataUrl, prompt, seed),
  // Used by the community-gallery save button (perchanceDriver.ts): those
  // tiles only expose a remote image URL, not an already-captured data URL,
  // so the actual download happens in the main process (Node fetch, not
  // subject to the page's own CORS restrictions) rather than here.
  saveImageFromUrl: (imageUrl: string, prompt: string, seed: string | null) =>
    ipcRenderer.send('perchance:saveImageFromUrl', imageUrl, prompt, seed),
});

// Confirms in DevTools whether this preload is actually running in a given
// frame at all — the generator lives in a subframe, and whether preload
// scripts load there depends on nodeIntegrationInSubFrames actually taking
// effect for it.
console.log(
  `[PromptLoom] perchancePreload loaded (mainFrame=${process.isMainFrame}, url=${location.href})`,
);

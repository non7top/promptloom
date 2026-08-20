import { builtinModules } from 'node:module';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Only Electron itself and Node builtins are external — everything else
// (electron-context-menu, better-sqlite3's JS wrapper, etc.) gets bundled
// straight into out/main/index.js, so the packaged app needs no
// node_modules at runtime at all.
const external = [
  'electron',
  'node:sqlite',
  ...builtinModules,
  ...builtinModules.map((mod) => `node:${mod}`),
];

export default defineConfig({
  main: {
    // electron-vite auto-adds its own externalize-deps plugin unless told
    // not to (build.externalizeDeps defaults to true) — it externalizes
    // every package.json "dependencies" entry as a bare require() with no
    // regard for the `external` list below. Confirmed live: with the
    // default on, electron-context-menu was already shipping as
    // require("electron-context-menu") in out/main/index.js despite the
    // comment above, which would crash the packaged app the first time a
    // context menu (or, now, gallery export/import) actually ran —
    // electron-builder.yml ships no node_modules at all.
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: 'src/main.ts' },
        external,
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        // Two independent preloads: the app's own, and a separate one for
        // the embedded perchance WebContentsView (see src/main/perchanceView.ts).
        input: {
          preload: 'src/preload.ts',
          perchancePreload: 'src/perchancePreload.ts',
        },
        output: {
          entryFileNames: '[name].js',
        },
        external,
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: 'index.html',
      },
    },
    plugins: [react()],
  },
});

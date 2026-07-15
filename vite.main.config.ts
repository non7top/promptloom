import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'electron',
        'node:sqlite',
        ...builtinModules,
        ...builtinModules.map((mod) => `node:${mod}`),
      ],
    },
  },
});

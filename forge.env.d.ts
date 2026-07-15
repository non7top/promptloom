/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import type { PromptLoomApi } from './src/shared/types';

declare global {
  interface Window {
    promptloom: PromptLoomApi;
  }
}

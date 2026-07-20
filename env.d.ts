import type { PromptLoomApi } from './src/shared/types';

declare global {
  interface Window {
    promptloom: PromptLoomApi;
  }
}

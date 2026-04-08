import type { SpendApi } from './types/api';

declare global {
  interface Window {
    readonly api: SpendApi;
  }
}

export {};

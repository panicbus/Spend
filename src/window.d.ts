import type { SpendApi } from '../ipc-contract';

declare global {
  interface Window {
    readonly api: SpendApi;
  }
}

export {};

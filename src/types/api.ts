/**
 * Renderer-facing API surface (Electron preload bridge).
 * Single source of truth for `window.api` typing lives in root ipc-contract.ts
 * so main/preload stay in sync; this module re-exports for convenience in src/.
 */

export type { SpendApi } from '../../ipc-contract';

/** Fired after Settings (or other) mutations that should refresh budget/transactions/import lists. */
export const DATA_CHANGED_EVENT = 'spend-app:data-changed';

export function dispatchDataChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

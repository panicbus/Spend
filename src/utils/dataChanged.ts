/** Fired after Settings (or other) mutations that should refresh budget/transactions/import lists. */
export const DATA_CHANGED_EVENT = 'spend-app:data-changed';

/** Fired when a month note is saved (lightweight Trends tooltip refresh). */
export const MONTH_NOTES_CHANGED_EVENT = 'spend-app:month-notes-changed';

export function dispatchDataChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

export function dispatchMonthNotesChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MONTH_NOTES_CHANGED_EVENT));
}

const STORAGE_KEY = 'spend-app:selected-month-key';

/** Fired on `window` when the selected month changes (same tab or after `writeStoredMonthKey`). */
export const MONTH_KEY_CHANGED_EVENT = 'spend-app:month-key-changed';

export type MonthKeyChangedDetail = { monthKey: string };

export function readStoredMonthKey(fallback: string): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && /^\d{4}-\d{2}$/.test(v)) {
      return v;
    }
  } catch {
    /* private mode / no storage */
  }
  return fallback;
}

export function writeStoredMonthKey(monthKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, monthKey);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<MonthKeyChangedDetail>(MONTH_KEY_CHANGED_EVENT, {
        detail: { monthKey },
      })
    );
  }
}

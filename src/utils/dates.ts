/** Earliest month with Spend data in this workspace (YYYY-MM). Previous-month nav stops here. */
export const EARLIEST_DATA_MONTH_KEY = '2026-02';

export function clampMonthKeyToEarliestData(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  return monthKey < EARLIEST_DATA_MONTH_KEY ? EARLIEST_DATA_MONTH_KEY : monthKey;
}

/** False when already at {@link EARLIEST_DATA_MONTH_KEY} (cannot go further back). */
export function canGoToPreviousDataMonth(monthKey: string): boolean {
  return monthKey > EARLIEST_DATA_MONTH_KEY;
}

export function formatMonthLabel(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function shiftMonthKey(monthKey: string, delta: number) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

export function currentMonthKey() {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

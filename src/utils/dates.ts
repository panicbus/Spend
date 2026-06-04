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

/**
 * Fraction of the calendar month elapsed (day / days-in-month).
 * Used for “today” markers on budget bars; only meaningful when viewing the active month.
 */
export function fractionThroughCalendarMonth(monthKey: string): number | null {
  if (monthKey !== currentMonthKey()) return null;
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || m < 1 || m > 12) return null;
  const daysInMonth = new Date(y, m, 0).getDate();
  if (daysInMonth <= 0) return null;
  const dom = new Date().getDate();
  return Math.min(1, Math.max(0, dom / daysInMonth));
}

/** Calendar days left in `monthKey` (0 for past months; full month for future). */
export function daysRemainingInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || m < 1 || m > 12) return 0;
  const daysInMonth = new Date(y, m, 0).getDate();
  if (daysInMonth <= 0) return 0;

  const current = currentMonthKey();
  if (monthKey < current) return 0;
  if (monthKey > current) return daysInMonth;

  const dayOfMonth = new Date().getDate();
  return Math.max(0, daysInMonth - dayOfMonth);
}

export function formatMonthRangeLabel(fromMonthKey: string, toMonthKey: string) {
  const [y1, m1] = fromMonthKey.split('-').map(Number);
  const [y2, m2] = toMonthKey.split('-').map(Number);
  const d1 = new Date(y1, m1 - 1, 1);
  const d2 = new Date(y2, m2 - 1, 1);
  const a = d1.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  const b = d2.toLocaleString('en-US', { month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}

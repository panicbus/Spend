import type { TrendData, TrendMonthSnapshot } from '../../ipc-contract';

/** Moves smaller than this are noise in a month-to-month comparison. */
export const MIN_MOVE_CENTS = 1000;

export type Mover = {
  categoryId: number;
  name: string;
  groupName: string;
  color: string;
  currentCents: number;
  priorCents: number;
  deltaCents: number;
  /** Null when there was no prior spend to compare against. */
  pct: number | null;
};

export type MoverComparison = {
  current: TrendMonthSnapshot;
  prior: TrendMonthSnapshot;
  up: Mover[];
  down: Mover[];
};

/** Months carrying any activity — the only ones worth comparing. */
export function monthsWithActivity(data: TrendData): TrendMonthSnapshot[] {
  return data.months.filter(
    (m) => m.totalSpendingCents > 0 || m.byCategory.length > 0
  );
}

/**
 * Category-by-category difference between two months, split into what went up
 * and what went down. `limit` caps each side; pass 0 for no cap.
 */
export function compareMonths(
  prior: TrendMonthSnapshot,
  current: TrendMonthSnapshot,
  limit = 5
): MoverComparison {
  const byId = new Map<number, Mover>();
  const put = (
    slice: TrendMonthSnapshot['byCategory'][number],
    field: 'currentCents' | 'priorCents'
  ) => {
    const existing = byId.get(slice.categoryId);
    if (existing) {
      existing[field] += slice.amountCents;
      return;
    }
    byId.set(slice.categoryId, {
      categoryId: slice.categoryId,
      name: slice.name,
      groupName: slice.groupName,
      color: slice.color,
      currentCents: field === 'currentCents' ? slice.amountCents : 0,
      priorCents: field === 'priorCents' ? slice.amountCents : 0,
      deltaCents: 0,
      pct: null,
    });
  };
  for (const s of prior.byCategory) put(s, 'priorCents');
  for (const s of current.byCategory) put(s, 'currentCents');

  const movers: Mover[] = [];
  for (const m of byId.values()) {
    m.deltaCents = m.currentCents - m.priorCents;
    m.pct = m.priorCents > 0 ? (m.deltaCents / m.priorCents) * 100 : null;
    if (Math.abs(m.deltaCents) >= MIN_MOVE_CENTS) movers.push(m);
  }

  const cap = (rows: Mover[]) => (limit > 0 ? rows.slice(0, limit) : rows);
  return {
    current,
    prior,
    up: cap(
      movers
        .filter((m) => m.deltaCents > 0)
        .sort((a, b) => b.deltaCents - a.deltaCents)
    ),
    down: cap(
      movers
        .filter((m) => m.deltaCents < 0)
        .sort((a, b) => a.deltaCents - b.deltaCents)
    ),
  };
}

/** The most recent pair of months that both carry activity. */
export function latestComparison(
  data: TrendData,
  limit = 5
): MoverComparison | null {
  const months = monthsWithActivity(data);
  if (months.length < 2) return null;
  const built = compareMonths(
    months[months.length - 2],
    months[months.length - 1],
    limit
  );
  return built.up.length === 0 && built.down.length === 0 ? null : built;
}

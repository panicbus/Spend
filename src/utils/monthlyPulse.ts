import type { BudgetGroup } from '../../ipc-contract';

export type PulseTone = 'good' | 'soft-warn' | 'warn' | 'danger' | 'muted';

export function verdictFromPace(pace: number): { label: string; tone: PulseTone } {
  if (pace <= 0.85) return { label: 'Way under', tone: 'good' };
  if (pace <= 1.0) return { label: 'On pace', tone: 'good' };
  if (pace <= 1.15) return { label: 'Slightly ahead', tone: 'soft-warn' };
  if (pace <= 1.4) return { label: 'Running hot', tone: 'warn' };
  return { label: 'Over pace', tone: 'danger' };
}

export function pctThroughMonth(dayOfMonth: number, daysInMonth: number): number {
  if (daysInMonth <= 0) return 0;
  return dayOfMonth / daysInMonth;
}

export function roundPct(ratio: number): number {
  return Math.min(100, Math.max(0, Math.round(ratio * 100)));
}

export type HotCategoryRow = {
  categoryId: number;
  name: string;
  groupColor: string;
  spentCents: number;
  budgetCents: number;
  pctUsed: number;
  pctMonth: number;
  pace: number;
};

/** Top categories by spending pace vs time through month (monthly budget per line). */
export function hotCategoriesAheadOfPace(
  groups: BudgetGroup[],
  percentThroughMonth: number,
  limit: number
): HotCategoryRow[] {
  if (percentThroughMonth <= 0) return [];

  const rows: HotCategoryRow[] = [];
  const pctMonth = roundPct(percentThroughMonth);

  for (const g of groups) {
    for (const c of g.categories ?? []) {
      const budgetCents = c.budget_cents ?? 0;
      const spentCents = c.spent_cents ?? 0;
      if (budgetCents <= 0 || spentCents <= 0) continue;

      const pctUsed = roundPct(spentCents / budgetCents);
      const pace = (spentCents / budgetCents) / percentThroughMonth;
      if (pace > 1) {
        rows.push({
          categoryId: c.id,
          name: c.name,
          groupColor: g.color,
          spentCents,
          budgetCents,
          pctUsed,
          pctMonth,
          pace,
        });
      }
    }
  }

  rows.sort((a, b) => b.pace - a.pace);
  return rows.slice(0, limit);
}

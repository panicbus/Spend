import type { BudgetGroup } from '../../ipc-contract';

export type PulseTone = 'good' | 'soft-warn' | 'warn' | 'danger' | 'muted';

/**
 * Bills that fully use their allocation (within a penny slack) without going over
 * are excluded from pooled “burn rate” extrapolation — e.g. rent paid on day 1
 * shouldn’t imply you spend at that pace all month.
 *
 * Overspent lines (spent > budget) stay in the pool so risk still surfaces.
 */
export function isPaceCompleteBudgetLine(
  spentCents: number,
  budgetCents: number
): boolean {
  if (budgetCents <= 0 || spentCents <= 0) return false;
  if (spentCents > budgetCents) return false;
  const slackCents = budgetCents - spentCents;
  return slackCents <= 99;
}

export type PulseAdjustedTotals = {
  /** Categories still accumulating vs their cap — drive burn-rate extrapolation */
  adjustableBudgetCents: number;
  adjustableSpentCents: number;
  /** Categories treated as satisfied this month — spending held flat in projections */
  completeSpentCents: number;
};

/** Sum buckets for pacing: “complete” lines vs everything else with budget > 0. */
export function computePulseAdjustedTotals(
  groups: BudgetGroup[]
): PulseAdjustedTotals {
  let adjustableBudgetCents = 0;
  let adjustableSpentCents = 0;
  let completeSpentCents = 0;

  for (const g of groups) {
    for (const c of g.categories ?? []) {
      const budgetCents = c.budget_cents ?? 0;
      const spentCents = c.spent_cents ?? 0;
      if (budgetCents <= 0) continue;

      if (isPaceCompleteBudgetLine(spentCents, budgetCents)) {
        completeSpentCents += spentCents;
        continue;
      }
      adjustableBudgetCents += budgetCents;
      adjustableSpentCents += spentCents;
    }
  }

  return { adjustableBudgetCents, adjustableSpentCents, completeSpentCents };
}

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

      if (isPaceCompleteBudgetLine(spentCents, budgetCents)) continue;

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

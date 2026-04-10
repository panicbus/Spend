import type { BudgetFrequency } from '../../ipc-contract';

/** Billings per calendar year for each sinking cadence (monthly uses direct budget, not this table). */
export const SINKING_PERIODS_PER_YEAR: Record<
  Exclude<BudgetFrequency, 'monthly'>,
  number
> = {
  yearly: 1,
  quarterly: 4,
  bimonthly: 6,
};

/** User input is “cost per bill” for that cadence; we always store total annual cents in the DB. */
export function annualCentsFromPerOccurrenceCents(
  perOccurrenceCents: number,
  frequency: BudgetFrequency
): number {
  if (frequency === 'monthly') return perOccurrenceCents;
  const periods = SINKING_PERIODS_PER_YEAR[frequency];
  return Math.round(perOccurrenceCents * periods);
}

/** Derive per-bill amount from stored annual total (for the edit field). */
export function perOccurrenceCentsFromAnnualCents(
  annualCents: number,
  frequency: BudgetFrequency
): number {
  if (frequency === 'monthly') return annualCents;
  const periods = SINKING_PERIODS_PER_YEAR[frequency];
  if (periods <= 0) return annualCents;
  return Math.round(annualCents / periods);
}

export function sinkingAmountFieldLabel(frequency: BudgetFrequency): string {
  switch (frequency) {
    case 'yearly':
      return 'Cost per year';
    case 'quarterly':
      return 'Cost per quarter';
    case 'bimonthly':
      return 'Cost every 2 months';
    default:
      return 'Monthly budget';
  }
}

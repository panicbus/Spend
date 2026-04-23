export const BUDGET_RETURN_STORAGE_KEY = 'spend-app:return-to-budget';

/** Stored when opening Transactions from Budget (donut legend) for “Back to Budget” + month restore. */
export interface BudgetReturnContext {
  monthKey: string;
}

export function setBudgetReturnContext(ctx: BudgetReturnContext): void {
  try {
    sessionStorage.setItem(BUDGET_RETURN_STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    /* private mode */
  }
}

export function readBudgetReturnContext(): BudgetReturnContext | null {
  try {
    const raw = sessionStorage.getItem(BUDGET_RETURN_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<BudgetReturnContext>;
    if (
      !v ||
      typeof v.monthKey !== 'string' ||
      !/^\d{4}-\d{2}$/.test(v.monthKey)
    ) {
      return null;
    }
    return { monthKey: v.monthKey };
  } catch {
    return null;
  }
}

export function clearBudgetReturnContext(): void {
  try {
    sessionStorage.removeItem(BUDGET_RETURN_STORAGE_KEY);
  } catch {
    /* */
  }
}

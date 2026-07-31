export const BUDGET_RETURN_STORAGE_KEY = 'spend-app:return-to-budget';

/** Stored when opening Transactions from Budget for “Back to Budget” + month restore. */
export interface BudgetReturnContext {
  monthKey: string;
  /** Re-open the category group overlay / expanded card after return. */
  openGroupId?: number;
  /** Scroll offset of the route container when Transactions was opened. */
  scrollY?: number;
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
    const openGroupId =
      typeof v.openGroupId === 'number' &&
      Number.isFinite(v.openGroupId) &&
      v.openGroupId > 0
        ? v.openGroupId
        : undefined;
    const scrollY =
      typeof v.scrollY === 'number' && Number.isFinite(v.scrollY) && v.scrollY > 0
        ? v.scrollY
        : undefined;
    return {
      monthKey: v.monthKey,
      ...(openGroupId != null ? { openGroupId } : {}),
      ...(scrollY != null ? { scrollY } : {}),
    };
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

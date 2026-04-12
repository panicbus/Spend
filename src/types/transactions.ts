/**
 * Transactions list view: expense rows + income_actuals rows.
 */

export interface Transaction {
  id: number;
  date: string;
  merchant: string;
  amountCents: number;
  categoryId: number;
  categoryName: string;
  groupName: string;
  groupColor: string;
  account: string;
  originalStatement: string;
  notes: string;
  importHash: string | null;
  source: 'manual' | 'csv';
  createdAt: string;
}

export interface IncomeActual {
  id: number;
  date: string;
  sourceId: number;
  sourceName: string;
  amountCents: number;
  description: string;
  importHash: string | null;
  createdAt: string;
}

/**
 * Filters for the unified transactions list IPC (`getTransactions`).
 * `categoryFilter` is authoritative so “show nothing” does not depend on empty arrays over IPC.
 * - `all` — every expense category; income rows included when `includeIncome` allows.
 * - `none` — zero expense rows and no income (master “all categories” unchecked).
 * - `subset` — only `categoryIds`; income excluded.
 */
export interface TransactionFilters {
  monthKey: string;
  /**
   * When set, expense rows are restricted to calendar months in this range (inclusive).
   * Income uses the same range when `includeIncome` is true.
   */
  dateRange?: { startMonthKey: string; endMonthKey: string };
  /**
   * Prefer always setting this from the renderer; main infers from `categoryIds` if omitted.
   */
  categoryFilter?: 'all' | 'none' | 'subset';
  /** Required when `categoryFilter` is `subset`. */
  categoryIds?: number[];
  search?: string;
  /** Default true — include income_actuals rows when no category filter is active. */
  includeIncome?: boolean;
  /**
   * When non-empty, returns no expense rows and only income_actuals for these sources.
   * Use with `dateRange` from Trends. Optional `incomeLineLabel` narrows to one description bucket.
   */
  incomeOnlySourceIds?: number[];
  /** Trimmed description match; use "—" for empty description (same as Trends buckets). */
  incomeLineLabel?: string;
}

export interface TransactionListResult {
  transactions: Transaction[];
  income: IncomeActual[];
  totals: {
    expenseCents: number;
    incomeCents: number;
    netCents: number;
    count: number;
  };
}

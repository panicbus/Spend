/** Shared IPC contract: preload bridge, renderer api wrapper, and documentation. */

export interface CategoryRow {
  id: number;
  group_id: number;
  name: string;
  sort_order: number;
}

export interface GroupWithCategories {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  categories: CategoryRow[];
}

export interface CreateGroupPayload {
  name: string;
  color?: string;
}

export interface CreateCategoryPayload {
  group_id: number;
  name: string;
}

export interface BudgetCategoryLine {
  id: number;
  name: string;
  sort_order: number;
  budget_cents: number;
  spent_cents: number;
}

export interface BudgetGroup {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  budget_cents: number;
  spent_cents: number;
  categories: BudgetCategoryLine[];
}

export interface BudgetIncomeRow {
  id: number;
  name: string;
  sort_order: number;
  budget_cents: number;
  actual_cents: number;
}

export interface BudgetPayload {
  groups: BudgetGroup[];
  income: BudgetIncomeRow[];
}

export interface BudgetTotals {
  totalBudget: number;
  totalSpent: number;
  remaining: number;
  incomeBudget: number;
  incomeActual: number;
}

export interface IncomeSourceRow {
  id: number;
  name: string;
}

export interface CreateIncomeSourcePayload {
  name: string;
}

export interface TransactionFilters {
  monthKey?: string;
  categoryId?: number;
}

export interface TransactionRow {
  id: number;
  date: string;
  description: string;
  amount_cents: number;
  category_id: number;
}

export interface AddTransactionPayload {
  category_id: number;
  date: string;
  description?: string;
  amount_cents: number;
}

export interface ImportCSVResult {
  imported: number;
  skipped: number;
}

export interface SpendApi {
  getGroups: () => Promise<GroupWithCategories[]>;
  createGroup: (payload: CreateGroupPayload) => Promise<{ id: number }>;
  createCategory: (payload: CreateCategoryPayload) => Promise<{ id: number }>;
  deleteCategory: (id: number) => Promise<void>;
  deleteGroup: (id: number) => Promise<void>;
  getBudget: (monthKey: string) => Promise<BudgetPayload>;
  setBudgetAmount: (
    categoryId: number,
    monthKey: string,
    amountCents: number
  ) => Promise<void>;
  getIncomeSources: () => Promise<IncomeSourceRow[]>;
  createIncomeSource: (
    payload: CreateIncomeSourcePayload
  ) => Promise<{ id: number }>;
  setIncomeBudget: (
    sourceId: number,
    monthKey: string,
    amountCents: number
  ) => Promise<void>;
  getTransactions: (filters: TransactionFilters) => Promise<TransactionRow[]>;
  addTransaction: (payload: AddTransactionPayload) => Promise<{ id: number }>;
  importCSV: (filePath: string) => Promise<ImportCSVResult>;
}

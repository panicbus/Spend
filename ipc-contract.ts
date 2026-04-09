/** Shared IPC contract: preload bridge, renderer api wrapper, and documentation. */

import type {
  CategoryMapping,
  CommitImportResult,
  CommitImportRow,
  ParseCSVResult,
  SaveCategoryMappingInput,
} from './src/types/import.js';
import type {
  IncomeActual,
  Transaction,
  TransactionFilters,
  TransactionListResult,
} from './src/types/transactions.js';

export type {
  CategoryMapping,
  CommitImportResult,
  CommitImportRow,
  MappingTargetType,
  ParseCSVResult,
  ParsedRow,
  SaveCategoryMappingInput,
} from './src/types/import.js';

export type {
  IncomeActual,
  Transaction,
  TransactionFilters,
  TransactionListResult,
} from './src/types/transactions.js';

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

export interface AddTransactionPayload {
  category_id: number;
  date: string;
  description?: string;
  amount_cents: number;
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
  getTransactions: (
    filters: TransactionFilters
  ) => Promise<TransactionListResult>;
  addTransaction: (payload: AddTransactionPayload) => Promise<{ id: number }>;
  updateTransactionCategory: (
    id: number,
    categoryId: number
  ) => Promise<void>;
  deleteTransaction: (id: number) => Promise<void>;
  deleteIncomeActual: (id: number) => Promise<void>;

  openCSVDialog: () => Promise<string | null>;
  getPathForFile: (file: File) => string;
  parseCSV: (filePath: string) => Promise<ParseCSVResult>;
  getCategoryMappings: () => Promise<CategoryMapping[]>;
  saveCategoryMapping: (input: SaveCategoryMappingInput) => Promise<void>;
  commitImport: (rows: CommitImportRow[]) => Promise<CommitImportResult>;
}

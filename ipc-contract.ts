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

/** Atomic create for CSV import mapping: new category in an existing or newly created group. */
export interface CreateCategoryForImportPayload {
  categoryName: string;
  existingGroupId?: number;
  newGroup?: { name: string; color: string };
}

export interface CreateCategoryForImportResult {
  categoryId: number;
  groupId: number;
}

export type BudgetFrequency =
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'bimonthly';

export interface BudgetCategoryLine {
  id: number;
  name: string;
  sort_order: number;
  budget_cents: number;
  spent_cents: number;
  frequency: BudgetFrequency;
  annual_amount_cents: number | null;
  accumulated_cents: number;
  spent_ytd_cents: number;
  remaining_cents: number;
  is_on_track: boolean;
}

export interface SetBudgetDetailsInput {
  frequency: BudgetFrequency;
  amountCents?: number;
  annualAmountCents?: number;
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

export type DefaultMonthOnLaunch = 'current' | 'last_viewed';

export interface AppPreferences {
  defaultMonthOnLaunch: DefaultMonthOnLaunch;
}

export interface UpdateGroupPayload {
  id: number;
  name: string;
  color: string;
}

export interface ReorderEntityPayload {
  id: number;
  direction: 'up' | 'down';
}

export interface MoveGroupCategoriesPayload {
  sourceGroupId: number;
  targetGroupId: number;
}

export interface UpdateCategoryPayload {
  id: number;
  name: string;
  groupId: number;
}

export interface UpdateIncomeSourcePayload {
  id: number;
  name: string;
}

export interface GroupDeletePreview {
  categoryCount: number;
  transactionCount: number;
}

export interface CategoryDeletePreview {
  transactionCount: number;
  budgetRowCount: number;
}

export interface IncomeSourceDeletePreview {
  actualCount: number;
  budgetRowCount: number;
}

export type ResetDatabaseMode = 'transactions' | 'full';

/** Preset windows for the Trends analytics page. */
export type TrendRange = '3m' | '6m' | '12m' | 'ytd' | 'all';

export interface TrendGroupSlice {
  groupId: number;
  name: string;
  color: string;
  sortOrder: number;
  amountCents: number;
}

export interface TrendCategorySlice {
  categoryId: number;
  name: string;
  groupId: number;
  groupName: string;
  color: string;
  amountCents: number;
}

export interface TrendIncomeSlice {
  sourceId: number;
  name: string;
  amountCents: number;
}

/** One bucket of income_actuals under a source (grouped by trimmed description). */
export interface TrendIncomeLineSlice {
  sourceId: number;
  /** Display label; empty descriptions use "—". */
  label: string;
  amountCents: number;
}

export interface TrendMonthSnapshot {
  monthKey: string;
  /** Short label for charts, e.g. Jan or Jan '26 */
  label: string;
  year: number;
  totalBudgetCents: number;
  totalSpendingCents: number;
  totalIncomeCents: number;
  netCents: number;
  byGroup: TrendGroupSlice[];
  byCategory: TrendCategorySlice[];
  byIncomeSource: TrendIncomeSlice[];
  byIncomeLine: TrendIncomeLineSlice[];
}

export interface TrendTopCategory {
  categoryId: number;
  name: string;
  groupId: number;
  groupName: string;
  color: string;
  totalCents: number;
}

export interface TrendGroupLegendItem {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
}

export interface TrendData {
  range: TrendRange;
  startMonthKey: string;
  endMonthKey: string;
  months: TrendMonthSnapshot[];
  topCategories: TrendTopCategory[];
  groups: TrendGroupLegendItem[];
  incomeSources: Array<{ id: number; name: string; sortOrder: number }>;
  /** Months in this range with any spending or income > 0 */
  monthsWithActivity: number;
  /** True if there is at least one expense row or income_actual row (either can drive charts). */
  hasTrendsData: boolean;
}

export interface SpendApi {
  getGroups: () => Promise<GroupWithCategories[]>;
  createGroup: (payload: CreateGroupPayload) => Promise<{ id: number }>;
  createCategory: (payload: CreateCategoryPayload) => Promise<{ id: number }>;
  createCategoryForImport: (
    payload: CreateCategoryForImportPayload
  ) => Promise<CreateCategoryForImportResult>;
  deleteCategory: (id: number) => Promise<void>;
  deleteGroup: (id: number) => Promise<void>;
  getPreferences: () => Promise<AppPreferences>;
  setPreferences: (partial: Partial<AppPreferences>) => Promise<void>;
  updateGroup: (payload: UpdateGroupPayload) => Promise<void>;
  reorderGroup: (payload: ReorderEntityPayload) => Promise<void>;
  moveGroupCategoriesDeleteGroup: (
    payload: MoveGroupCategoriesPayload
  ) => Promise<void>;
  getGroupDeletePreview: (groupId: number) => Promise<GroupDeletePreview>;
  updateCategory: (payload: UpdateCategoryPayload) => Promise<void>;
  reorderCategory: (payload: ReorderEntityPayload) => Promise<void>;
  getCategoryDeletePreview: (
    categoryId: number
  ) => Promise<CategoryDeletePreview>;
  updateIncomeSource: (payload: UpdateIncomeSourcePayload) => Promise<void>;
  reorderIncomeSource: (payload: ReorderEntityPayload) => Promise<void>;
  getIncomeSourceDeletePreview: (
    sourceId: number
  ) => Promise<IncomeSourceDeletePreview>;
  deleteIncomeSource: (sourceId: number) => Promise<void>;
  deleteCategoryMapping: (mappingId: number) => Promise<void>;
  exportDatabaseBackup: () => Promise<string | null>;
  importDatabaseBackup: () => Promise<void>;
  resetDatabase: (mode: ResetDatabaseMode) => Promise<void>;
  getBudget: (monthKey: string) => Promise<BudgetPayload>;
  setBudgetAmount: (
    categoryId: number,
    monthKey: string,
    amountCents: number
  ) => Promise<void>;
  setBudgetDetails: (
    categoryId: number,
    monthKey: string,
    details: SetBudgetDetailsInput,
    /** When true with a non-monthly frequency, sync this category’s budget rows for all 12 months of monthKey’s year. Passed separately so it cannot be dropped by IPC cloning. */
    applyToFullYear?: boolean
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

  getTrends: (range: TrendRange) => Promise<TrendData>;
}

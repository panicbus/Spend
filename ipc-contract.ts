/** Shared IPC contract: preload bridge, renderer api wrapper, and documentation. */

import type {
  CategoryMapping,
  CommitImportResult,
  CommitImportRow,
  GenericColumnMapping,
  ParseCSVOptions,
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
  GenericColumnMapping,
  MappingTargetType,
  ParseCSVOptions,
  ParseCSVResult,
  ParsedRow,
  SaveCategoryMappingInput,
} from './src/types/import.js';

export type { PeekCSVResult } from './src/utils/csvProfileParser.js';

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

export type ColorMode = 'light' | 'dark';

export interface AppPreferences {
  defaultMonthOnLaunch: DefaultMonthOnLaunch;
  /** UI theme; persisted in settings. Default light when unset. */
  colorMode: ColorMode;
  /** First-run wizard completed or dismissed. */
  firstRunComplete?: boolean;
  /** Getting-started checklist manually dismissed or auto-hidden. */
  checklistDismissed?: boolean;
  /** User has opened the Transactions page at least once. */
  viewedTransactions?: boolean;
  /** User finished or dismissed the first-run wizard (not auto-skipped on upgrade). */
  wizardSeen?: boolean;
}

export interface SetupStatus {
  firstRunComplete: boolean;
  checklistDismissed: boolean;
  viewedTransactions: boolean;
  groupCount: number;
  categoryCount: number;
  transactionCount: number;
  categoriesWithBudgetCount: number;
}

export interface SeedDefaultSetupResult {
  groupCount: number;
  categoryCount: number;
  incomeSourceCount: number;
  created: boolean;
}

export interface BudgetSuggestionLine {
  id: number;
  suggestedCents: number;
  label: string;
}
export interface BudgetSuggestions {
  categories: BudgetSuggestionLine[];
  income: BudgetSuggestionLine[];
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

export interface MerchantInsights {
  totalCents: number;
  transactionCount: number;
  averageCents: number;
  firstDate: string;
  lastDate: string;
  frequencyPerMonth: number;
  topCategory: {
    id: number;
    name: string;
    groupName: string;
    groupColor: string;
  };
  monthlySpending: Array<{ monthKey: string; totalCents: number }>;
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
  getSetupStatus: (monthKey: string) => Promise<SetupStatus>;
  seedDefaultSetup: () => Promise<SeedDefaultSetupResult>;
  getBudgetSuggestions: (monthKey: string) => Promise<BudgetSuggestions>;
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
  peekCSV: (
    filePath: string,
    headerRowIndex?: number
  ) => Promise<import('./src/utils/csvProfileParser.js').PeekCSVResult>;
  parseCSV: (
    filePath: string,
    options?: ParseCSVOptions
  ) => Promise<ParseCSVResult>;
  getLastImportProfile: () => Promise<string>;
  setLastImportProfile: (profileId: string) => Promise<void>;
  getCategoryMappings: () => Promise<CategoryMapping[]>;
  saveCategoryMapping: (input: SaveCategoryMappingInput) => Promise<void>;
  commitImport: (rows: CommitImportRow[]) => Promise<CommitImportResult>;
  /** How many of the given import hashes already exist in transactions or income_actuals (row-wise). */
  checkDuplicates: (hashes: string[]) => Promise<number>;
  /** Sum of transaction amount_cents for the month (matches budget “spent” basis). */
  getMonthSpendingTotal: (monthKey: string) => Promise<number>;

  getTrends: (range: TrendRange) => Promise<TrendData>;

  getMerchantInsights: (merchantName: string) => Promise<MerchantInsights>;
  getMonthNote: (monthKey: string) => Promise<string>;
  setMonthNote: (monthKey: string, note: string) => Promise<void>;
}

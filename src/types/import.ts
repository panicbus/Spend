/**
 * Monarch CSV import: domain types shared by renderer, preload contract, and main (via ipc-contract).
 */

import type { GenericColumnMapping } from '../utils/csv-profiles.js';

export type MappingTargetType = 'category' | 'income_source' | 'skip';

export interface CategoryMapping {
  id: number;
  source: string;
  externalName: string;
  targetType: MappingTargetType;
  targetId: number | null;
  targetName?: string;
}

export interface ParsedRow {
  rowIndex: number;
  date: string;
  merchant: string;
  externalCategory: string;
  amountCents: number;
  isIncome: boolean;
  originalStatement: string;
  notes: string;
  account: string;
  importHash: string;
  mapping: CategoryMapping | null;
}

export interface ParseCSVResult {
  rows: ParsedRow[];
  /** Unique trimmed Monarch category names that have no row in category_mappings. */
  unknownCategories: string[];
}

export interface SaveCategoryMappingInput {
  externalName: string;
  targetType: MappingTargetType;
  targetId: number | null;
  /** Mapping source / profile id (defaults to monarch). */
  source?: string;
}

export interface ParseCSVOptions {
  profileId: string;
  genericMapping?: GenericColumnMapping | null;
}

export type { GenericColumnMapping } from '../utils/csv-profiles.js';

export interface CommitImportRow {
  importHash: string;
  date: string;
  merchant: string;
  amountCents: number;
  originalStatement: string;
  notes: string;
  account?: string;
  targetType: MappingTargetType;
  targetId: number | null;
  skip: boolean;
}

export interface CommitImportResult {
  imported: number;
  skipped: number;
  duplicates: number;
  /** Rows not imported because category_id or source_id no longer exists (stale mapping). */
  staleTargets: number;
  /** Expense cents inserted this commit (category targets only). */
  addedExpenseCents: number;
  /** Income cents inserted this commit. */
  addedIncomeCents: number;
  /** Distinct categories that received new expense rows. */
  addedExpenseCategoryCount: number;
  /** Distinct income sources that received new rows. */
  addedIncomeSourceCount: number;
  /** Expense cents added per calendar month (YYYY-MM) from new rows only. */
  addedExpenseCentsByMonth: Record<string, number>;
}

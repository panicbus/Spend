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

/** A row about to be imported, as handed to the dedupe matcher. */
export interface DedupeRow {
  rowIndex: number;
  date: string;
  merchant: string;
  amountCents: number;
  originalStatement: string;
  account?: string | null;
  importHash: string;
}

export type DuplicateReason = 'hash' | 'same_day' | 'near_day' | 'same_file';

export interface DuplicateMatch {
  rowIndex: number;
  /** `duplicate` is skipped on commit; `possible` imports unless the user skips it. */
  verdict: 'duplicate' | 'possible';
  reason: DuplicateReason;
  /** What it matched: an existing transaction, or (id null) an earlier row in the same file. */
  existing: {
    id: number | null;
    date: string;
    merchant: string;
    amountCents: number;
    account: string;
  };
}

export interface DuplicateAnalysis {
  matches: DuplicateMatch[];
  duplicateCount: number;
  possibleCount: number;
  /** Candidate rows minus certain duplicates. */
  newCount: number;
}

/** A stored ledger row, as shown in the duplicate cleanup list. */
export interface DuplicateRow {
  id: number;
  kind: 'transaction' | 'income';
  date: string;
  merchant: string;
  /** Display space: expenses negative, income positive. */
  amountCents: number;
  /** Category name, or income source name. */
  label: string;
  account: string;
  source: 'csv' | 'manual';
  createdAt: string;
}

/** Two stored rows that look like the same charge: keep the older, remove the newer. */
export interface DuplicatePair {
  keep: DuplicateRow;
  remove: DuplicateRow;
  verdict: 'duplicate' | 'possible';
  reason: DuplicateReason;
}

export interface DeleteLedgerRowsInput {
  transactionIds: number[];
  incomeIds: number[];
}

export interface CommitImportResult {
  imported: number;
  skipped: number;
  /** Rows the dedupe matched to an existing transaction and did not insert. */
  duplicates: number;
  /** Rows imported despite looking like a near-match (date drift, same-file echo). */
  possibleDuplicates: number;
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

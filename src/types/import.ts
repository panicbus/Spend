/**
 * Monarch CSV import: domain types shared by renderer, preload contract, and main (via ipc-contract).
 */

export type MappingTargetType = 'category' | 'income_source' | 'skip';

export interface CategoryMapping {
  id: number;
  source: 'monarch';
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
}

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
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import type { CategoryMapping, ParsedRow } from '../types/import.js';
import type { GenericColumnMapping } from './csv-profiles.js';
import { getCSVProfile } from './csv-profiles.js';
import { amountCentsFromRow } from './parseCsvAmount.js';
import { parseCsvDate } from './parseCsvDate.js';

export type PeekCSVResult = {
  headers: string[];
  /** First few data rows (values aligned to headers) for preview. */
  previewRows: string[][];
};

type MappingDbRow = {
  id: number;
  external_name: string;
  target_type: string;
  target_id: number | null;
};

type MappingTargetType = 'category' | 'income_source' | 'skip';

function trimHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim();
}

function readRawCsvRows(filePath: string): string[][] {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  try {
    return parse(fileContent, {
      bom: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      cast: false,
    }) as string[][];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Could not read this CSV: ${msg}`);
  }
}

export function peekCSV(filePath: string, headerRowIndex = 0): PeekCSVResult {
  const rows = readRawCsvRows(filePath);
  if (rows.length <= headerRowIndex) {
    throw new Error('This CSV has no header row.');
  }
  const headers = rows[headerRowIndex].map(trimHeader);
  const previewRows = rows
    .slice(headerRowIndex + 1, headerRowIndex + 4)
    .map((r) => headers.map((_, i) => (r[i] ?? '').trim()));
  return { headers, previewRows };
}

function findHeaderIndex(headers: string[], column: string): number {
  const target = column.trim();
  return headers.findIndex((h) => h === target);
}

function requireColumn(
  headers: string[],
  column: string,
  profileName: string
): void {
  if (!column) return;
  const idx = findHeaderIndex(headers, column);
  if (idx < 0) {
    throw new Error(
      `Couldn't find a "${column}" column in this file. Are you sure this is a ${profileName} export? Try a different format.`
    );
  }
}

function validateMappingColumns(
  headers: string[],
  mapping: GenericColumnMapping,
  profileName: string
): void {
  requireColumn(headers, mapping.dateColumn, profileName);
  requireColumn(headers, mapping.merchantColumn, profileName);
  if (mapping.amountMode.type === 'single') {
    requireColumn(headers, mapping.amountMode.column, profileName);
  } else {
    requireColumn(headers, mapping.amountMode.debitColumn, profileName);
    requireColumn(headers, mapping.amountMode.creditColumn, profileName);
  }
  if (mapping.categoryColumn) {
    requireColumn(headers, mapping.categoryColumn, profileName);
  }
}

function recordFromRow(
  headers: string[],
  row: string[]
): Record<string, string> {
  const rec: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    if (!key) continue;
    rec[key] = (row[i] ?? '').trim();
  }
  return rec;
}

function computeImportHash(
  date: string,
  merchant: string,
  amountCents: number,
  originalStatement: string
): string {
  const payload =
    date + '|' + merchant + '|' + String(amountCents) + '|' + originalStatement;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function targetDisplayName(
  targetType: MappingTargetType,
  targetId: number | null,
  catNames: Map<number, string>,
  incomeNames: Map<number, string>
): string | undefined {
  if (targetType === 'skip' || targetId == null) return undefined;
  if (targetType === 'category') return catNames.get(targetId);
  if (targetType === 'income_source') return incomeNames.get(targetId);
  return undefined;
}

function toCategoryMapping(
  row: MappingDbRow,
  source: string,
  catNames: Map<number, string>,
  incomeNames: Map<number, string>
): CategoryMapping {
  const targetType = row.target_type as MappingTargetType;
  if (targetType === 'skip' || row.target_id == null) {
    return {
      id: row.id,
      source,
      externalName: row.external_name,
      targetType: 'skip',
      targetId: null,
    };
  }
  const tn = targetDisplayName(
    targetType,
    row.target_id,
    catNames,
    incomeNames
  );
  if (!tn) {
    return {
      id: row.id,
      source,
      externalName: row.external_name,
      targetType: 'skip',
      targetId: null,
    };
  }
  return {
    id: row.id,
    source,
    externalName: row.external_name,
    targetType,
    targetId: row.target_id,
    targetName: tn,
  };
}

export type ProfileParseDeps = {
  mappingSource: string;
  profileName: string;
  loadMappingNameLookups: () => {
    catNames: Map<number, string>;
    incomeNames: Map<number, string>;
  };
  loadMappingRows: (source: string) => MappingDbRow[];
};

export function parseProfileCSV(
  filePath: string,
  mapping: GenericColumnMapping,
  deps: ProfileParseDeps
): { rows: ParsedRow[]; unknownCategories: string[] } {
  const headerRowIndex = mapping.headerRowIndex ?? 0;
  const rawRows = readRawCsvRows(filePath);
  if (rawRows.length <= headerRowIndex) {
    throw new Error('This CSV has no transaction rows.');
  }

  const headers = rawRows[headerRowIndex].map(trimHeader);
  validateMappingColumns(headers, mapping, deps.profileName);

  const dataRows = rawRows.slice(headerRowIndex + 1);
  if (!dataRows.length) {
    throw new Error('This CSV has no transaction rows.');
  }

  const { catNames, incomeNames } = deps.loadMappingNameLookups();
  const mappingRows = deps.loadMappingRows(deps.mappingSource);
  const mappingByExternal = new Map<string, MappingDbRow>();
  for (const m of mappingRows) {
    mappingByExternal.set(m.external_name, m);
  }

  const rows: ParsedRow[] = [];
  const unknownSet = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const rec = recordFromRow(headers, dataRows[i]);
    const rowLabel = `row ${headerRowIndex + i + 2} (after header)`;

    const date = parseCsvDate(
      rec[mapping.dateColumn] ?? '',
      mapping.dateFormat,
      rowLabel
    );
    const merchant = (rec[mapping.merchantColumn] ?? '').trim();
    const externalCategory = mapping.categoryColumn
      ? (rec[mapping.categoryColumn] ?? '').trim()
      : '';
    const account = mapping.accountColumn
      ? (rec[mapping.accountColumn] ?? '').trim()
      : '';
    const notes = mapping.notesColumn
      ? (rec[mapping.notesColumn] ?? '').trim()
      : '';
    const originalStatement = mapping.statementColumn
      ? (rec[mapping.statementColumn] ?? '').trim()
      : merchant;

    const amountCents = amountCentsFromRow(rec, mapping.amountMode, rowLabel);
    const importHash = computeImportHash(
      date,
      merchant,
      amountCents,
      originalStatement
    );

    const mapRow = mappingByExternal.get(externalCategory);
    const rowMapping: CategoryMapping | null = mapRow
      ? toCategoryMapping(
          mapRow,
          deps.mappingSource,
          catNames,
          incomeNames
        )
      : null;

    if (!rowMapping) {
      unknownSet.add(externalCategory);
    }

    rows.push({
      rowIndex: i,
      date,
      merchant,
      externalCategory,
      amountCents,
      isIncome: amountCents > 0,
      originalStatement,
      notes,
      account,
      importHash,
      mapping: rowMapping,
    });
  }

  const unknownCategories = [...unknownSet].sort((a, b) =>
    a.localeCompare(b)
  );
  return { rows, unknownCategories };
}

export function profileNameForId(profileId: string): string {
  return getCSVProfile(profileId)?.name ?? profileId;
}

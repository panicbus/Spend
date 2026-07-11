import type Database from 'better-sqlite3';
import type {
  CategoryMapping,
  CommitImportRow,
  MappingTargetType,
  ParsedRow,
} from './src/types/import.js';

export type MappingDbRow = {
  id: number;
  external_name: string;
  target_type: string;
  target_id: number | null;
};

export function loadMappingNameLookups(db: Database.Database): {
  catNames: Map<number, string>;
  incomeNames: Map<number, string>;
} {
  const catRows = db
    .prepare(
      `SELECT c.id, c.name AS cat_name, g.name AS group_name
       FROM categories c JOIN category_groups g ON c.group_id = g.id`
    )
    .all() as { id: number; cat_name: string; group_name: string }[];
  const catNames = new Map<number, string>();
  for (const r of catRows) {
    catNames.set(r.id, `${r.cat_name} · ${r.group_name}`);
  }
  const incRows = db
    .prepare('SELECT id, name FROM income_sources')
    .all() as { id: number; name: string }[];
  const incomeNames = new Map<number, string>();
  for (const r of incRows) {
    incomeNames.set(r.id, r.name);
  }
  return { catNames, incomeNames };
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

export function toCategoryMapping(
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
  const tn = targetDisplayName(targetType, row.target_id, catNames, incomeNames);
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

export function loadMappingRows(
  db: Database.Database,
  source: string
): MappingDbRow[] {
  return db
    .prepare(
      `SELECT id, external_name, target_type, target_id
       FROM category_mappings WHERE source = ?`
    )
    .all(source) as MappingDbRow[];
}

export function enrichParsedRowsWithMappings(
  db: Database.Database,
  rows: ParsedRow[],
  source = 'monarch'
): { rows: ParsedRow[]; unknownCategories: string[] } {
  const { catNames, incomeNames } = loadMappingNameLookups(db);
  const mappingRows = loadMappingRows(db, source);
  const mappingByExternal = new Map<string, MappingDbRow>();
  for (const m of mappingRows) {
    mappingByExternal.set(m.external_name, m);
  }

  const unknownSet = new Set<string>();
  const enriched = rows.map((row) => {
    const externalCategory = row.externalCategory;
    const mapRow = mappingByExternal.get(externalCategory);
    const mapping: CategoryMapping | null = mapRow
      ? toCategoryMapping(mapRow, source, catNames, incomeNames)
      : null;
    if (!mapping) {
      unknownSet.add(externalCategory);
    }
    return { ...row, mapping };
  });

  const unknownCategories = [...unknownSet].sort((a, b) =>
    a.localeCompare(b)
  );
  return { rows: enriched, unknownCategories };
}

function effectiveRowTarget(row: ParsedRow): {
  targetType: MappingTargetType;
  targetId: number | null;
  skip: boolean;
} {
  const m = row.mapping;
  if (!m) {
    return { targetType: 'skip', targetId: null, skip: true };
  }
  if (m.targetType === 'skip') {
    return { targetType: 'skip', targetId: null, skip: true };
  }
  return {
    targetType: m.targetType,
    targetId: m.targetId,
    skip: false,
  };
}

export function parsedRowsToCommitRows(rows: ParsedRow[]): CommitImportRow[] {
  return rows.map((row) => {
    const e = effectiveRowTarget(row);
    const skip = e.skip || e.targetType === 'skip';
    return {
      importHash: row.importHash,
      date: row.date,
      merchant: row.merchant,
      amountCents: row.amountCents,
      originalStatement: row.originalStatement,
      notes: row.notes,
      account: row.account,
      targetType: e.targetType,
      targetId: e.targetId,
      skip,
    };
  });
}

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import Database from 'better-sqlite3';
import type {
  AddTransactionPayload,
  BudgetPayload,
  CreateCategoryPayload,
  CreateGroupPayload,
  CreateIncomeSourcePayload,
} from './ipc-contract.js';
import type {
  IncomeActual,
  Transaction,
  TransactionFilters,
  TransactionListResult,
} from './src/types/transactions.js';
import type {
  CategoryMapping,
  CommitImportRow,
  MappingTargetType,
  ParsedRow,
  SaveCategoryMappingInput,
} from './src/types/import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MONARCH_HEADERS = [
  'Date',
  'Merchant',
  'Category',
  'Account',
  'Original Statement',
  'Notes',
  'Amount',
  'Tags',
  'Owner',
] as const;

const MAPPING_SOURCE = 'monarch';

app.setPath('userData', path.join(app.getPath('appData'), 'spend-app'));

process.on('uncaughtException', (err) => {
  console.error('[Spend] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Spend] unhandledRejection:', reason);
});

let db!: Database.Database;

function getDbPath() {
  return path.join(app.getPath('userData'), 'spend.db');
}

function tryExec(sql: string) {
  try {
    db.exec(sql);
  } catch {
    /** already applied */
  }
}

function runSqliteMigrations() {
  try {
    db.exec('ALTER TABLE transactions ADD COLUMN import_hash TEXT');
  } catch {
    /** column already present */
  }
  tryExec('ALTER TABLE transactions ADD COLUMN merchant TEXT');
  tryExec('ALTER TABLE transactions ADD COLUMN account TEXT');
  tryExec('ALTER TABLE transactions ADD COLUMN original_statement TEXT');
  tryExec('ALTER TABLE transactions ADD COLUMN notes TEXT');
  db.prepare(
    `UPDATE transactions SET merchant = description
     WHERE merchant IS NULL OR TRIM(COALESCE(merchant, '')) = ''`
  ).run();
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_transactions_import_hash ON transactions(import_hash)'
  );
}

function initDb() {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  /** Must run after schema: ADD COLUMN for legacy DBs, then index (not in schema.sql). */
  runSqliteMigrations();
}

function copyMonthTemplateIfNeeded(monthKey: string) {
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM budgets WHERE month_key = ?')
    .get(monthKey) as { c: number };
  if (count.c > 0) return;

  const prev = db
    .prepare(
      `SELECT month_key FROM budgets
       WHERE month_key < ?
       GROUP BY month_key
       ORDER BY month_key DESC
       LIMIT 1`
    )
    .get(monthKey) as { month_key: string } | undefined;

  if (!prev) return;

  const prevKey = prev.month_key;

  db.prepare(
    `INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
     SELECT category_id, ?, amount_cents FROM budgets WHERE month_key = ?`
  ).run(monthKey, prevKey);

  db.prepare(
    `INSERT OR REPLACE INTO income_budgets (source_id, month_key, amount_cents)
     SELECT source_id, ?, amount_cents FROM income_budgets WHERE month_key = ?`
  ).run(monthKey, prevKey);
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

function assertMonarchHeader(header: string[]) {
  if (header.length < MONARCH_HEADERS.length) {
    throw new Error(
      'This file does not look like a Monarch export (missing columns).'
    );
  }
  for (let i = 0; i < MONARCH_HEADERS.length; i++) {
    const got = (header[i] ?? '').trim();
    if (got !== MONARCH_HEADERS[i]) {
      throw new Error(
        `This file does not look like a Monarch export (expected column "${MONARCH_HEADERS[i]}", found "${got || '(empty)'}").`
      );
    }
  }
}

function parseAmountToCents(amountStr: string, rowLabel: string): number {
  const cleaned = amountStr.trim().replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid amount on ${rowLabel}: "${amountStr}"`);
  }
  return Math.round(n * 100);
}

type MappingDbRow = {
  id: number;
  external_name: string;
  target_type: string;
  target_id: number | null;
};

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
  catNames: Map<number, string>,
  incomeNames: Map<number, string>
): CategoryMapping {
  const targetType = row.target_type as MappingTargetType;
  const tn = targetDisplayName(targetType, row.target_id, catNames, incomeNames);
  return {
    id: row.id,
    source: 'monarch',
    externalName: row.external_name,
    targetType,
    targetId: row.target_id,
    ...(tn ? { targetName: tn } : {}),
  };
}

function loadMappingNameLookups(): {
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

function parseMonarchCSV(filePath: string): {
  rows: ParsedRow[];
  unknownCategories: string[];
} {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  let records: Record<(typeof MONARCH_HEADERS)[number], string>[];
  try {
    records = parse(fileContent, {
      bom: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      columns: (header: string[]) => {
        assertMonarchHeader(header);
        return [...MONARCH_HEADERS];
      },
      cast: false,
    }) as Record<(typeof MONARCH_HEADERS)[number], string>[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Could not read this CSV: ${msg}`);
  }

  if (!records.length) {
    throw new Error('This CSV has no transaction rows.');
  }

  const { catNames, incomeNames } = loadMappingNameLookups();

  const mappingRows = db
    .prepare(
      `SELECT id, external_name, target_type, target_id
       FROM category_mappings WHERE source = ?`
    )
    .all(MAPPING_SOURCE) as MappingDbRow[];

  const mappingByExternal = new Map<string, MappingDbRow>();
  for (const m of mappingRows) {
    mappingByExternal.set(m.external_name, m);
  }

  const rows: ParsedRow[] = [];
  const unknownSet = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const date = (rec.Date ?? '').trim();
    const merchant = (rec.Merchant ?? '').trim();
    const externalCategory = (rec.Category ?? '').trim();
    const account = (rec.Account ?? '').trim();
    const originalStatement = (rec['Original Statement'] ?? '').trim();
    const notes = (rec.Notes ?? '').trim();
    const amountStr = rec.Amount ?? '';

    if (!date) {
      throw new Error(`Missing date on data row ${i + 2} (after header).`);
    }

    const amountCents = parseAmountToCents(amountStr, `row ${i + 2}`);
    const importHash = computeImportHash(
      date,
      merchant,
      amountCents,
      originalStatement
    );

    const mapRow = mappingByExternal.get(externalCategory);
    const mapping: CategoryMapping | null = mapRow
      ? toCategoryMapping(mapRow, catNames, incomeNames)
      : null;

    if (!mapping) {
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
      mapping,
    });
  }

  const unknownCategories = [...unknownSet].sort((a, b) =>
    a.localeCompare(b)
  );

  return { rows, unknownCategories };
}

function getBudgetData(monthKey: string): BudgetPayload {
  copyMonthTemplateIfNeeded(monthKey);

  const spentRows = db
    .prepare(
      `SELECT category_id, COALESCE(SUM(amount_cents), 0) AS spent_cents
       FROM transactions
       WHERE substr(date, 1, 7) = ?
       GROUP BY category_id`
    )
    .all(monthKey) as { category_id: number; spent_cents: number }[];

  const spentByCat: Record<number, number> = Object.fromEntries(
    spentRows.map((r) => [r.category_id, r.spent_cents])
  );

  const actualRows = db
    .prepare(
      `SELECT source_id, COALESCE(SUM(amount_cents), 0) AS actual_cents
       FROM income_actuals
       WHERE substr(date, 1, 7) = ?
       GROUP BY source_id`
    )
    .all(monthKey) as { source_id: number; actual_cents: number }[];

  const actualBySource: Record<number, number> = Object.fromEntries(
    actualRows.map((r) => [r.source_id, r.actual_cents])
  );

  const groups = db
    .prepare('SELECT * FROM category_groups ORDER BY sort_order ASC, id ASC')
    .all() as {
    id: number;
    name: string;
    color: string;
    sort_order: number;
  }[];

  const getBudget = db.prepare(
    'SELECT amount_cents FROM budgets WHERE category_id = ? AND month_key = ?'
  );
  const getCats = db.prepare(
    'SELECT * FROM categories WHERE group_id = ? ORDER BY sort_order ASC, id ASC'
  );

  const resultGroups = groups.map((g) => {
    const cats = getCats.all(g.id) as {
      id: number;
      name: string;
      sort_order: number;
    }[];
    let groupBudget = 0;
    let groupSpent = 0;
    const categories = cats.map((c) => {
      const b = getBudget.get(c.id, monthKey) as
        | { amount_cents: number }
        | undefined;
      const budget_cents = b ? b.amount_cents : 0;
      const spent_cents = spentByCat[c.id] ?? 0;
      groupBudget += budget_cents;
      groupSpent += spent_cents;
      return {
        id: c.id,
        name: c.name,
        sort_order: c.sort_order,
        budget_cents,
        spent_cents,
      };
    });
    return {
      id: g.id,
      name: g.name,
      color: g.color,
      sort_order: g.sort_order,
      budget_cents: groupBudget,
      spent_cents: groupSpent,
      categories,
    };
  });

  const incomeRows = db
    .prepare(
      `SELECT s.id, s.name, s.sort_order,
        COALESCE(ib.amount_cents, 0) AS budget_cents
       FROM income_sources s
       LEFT JOIN income_budgets ib ON ib.source_id = s.id AND ib.month_key = ?
       ORDER BY s.sort_order ASC, s.id ASC`
    )
    .all(monthKey) as {
    id: number;
    name: string;
    sort_order: number;
    budget_cents: number;
  }[];

  const income = incomeRows.map((r) => ({
    id: r.id,
    name: r.name,
    sort_order: r.sort_order,
    budget_cents: r.budget_cents,
    actual_cents: actualBySource[r.id] ?? 0,
  }));

  return { groups: resultGroups, income };
}

type DbTxRow = {
  id: number;
  date: string;
  amount_cents: number;
  category_id: number;
  import_hash: string | null;
  source: string;
  created_at: string;
  description: string;
  merchant: string;
  account: string;
  original_statement: string;
  notes: string;
  category_name: string;
  group_name: string;
  group_color: string;
};

type DbIncRow = {
  id: number;
  date: string;
  source_id: number;
  source_name: string;
  amount_cents: number;
  description: string;
  import_hash: string | null;
  created_at: string;
};

function mapDbTxToTransaction(row: DbTxRow): Transaction {
  const src: 'manual' | 'csv' = row.source === 'csv' ? 'csv' : 'manual';
  return {
    id: row.id,
    date: row.date,
    merchant: row.merchant || row.description,
    amountCents: -row.amount_cents,
    categoryId: row.category_id,
    categoryName: row.category_name,
    groupName: row.group_name,
    groupColor: row.group_color,
    account: row.account,
    originalStatement: row.original_statement,
    notes: row.notes,
    importHash: row.import_hash,
    source: src,
    createdAt: row.created_at,
  };
}

function mapDbIncToIncomeActual(row: DbIncRow): IncomeActual {
  return {
    id: row.id,
    date: row.date,
    sourceId: row.source_id,
    sourceName: row.source_name,
    amountCents: row.amount_cents,
    description: row.description,
    importHash: row.import_hash,
    createdAt: row.created_at,
  };
}

function getTransactionsList(filters: TransactionFilters): TransactionListResult {
  const monthKey = filters.monthKey;
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error('Invalid monthKey (expected YYYY-MM).');
  }
  const likeMonth = `${monthKey}%`;
  const ids = filters.categoryIds;
  const mode: 'all' | 'none' | 'subset' =
    filters.categoryFilter ??
    (ids === undefined
      ? 'all'
      : ids.length === 0
        ? 'none'
        : 'subset');

  let categoryFilterNone = mode === 'none';
  let categoryFilterSubset = mode === 'subset';
  let subsetIds: number[] =
    mode === 'subset' && Array.isArray(ids) ? ids : [];

  if (mode === 'subset' && subsetIds.length === 0) {
    categoryFilterNone = true;
    categoryFilterSubset = false;
  }

  const categoryFilterActive =
    categoryFilterNone || categoryFilterSubset;
  const includeIncome =
    filters.includeIncome !== false && !categoryFilterActive;
  const search = filters.search?.trim();

  let sql = `
    SELECT t.id, t.date, t.amount_cents, t.category_id, t.import_hash, t.source, t.created_at,
           t.description,
           COALESCE(NULLIF(TRIM(t.merchant), ''), t.description) AS merchant,
           COALESCE(t.account, '') AS account,
           COALESCE(t.original_statement, '') AS original_statement,
           COALESCE(t.notes, '') AS notes,
           c.name AS category_name, g.name AS group_name, g.color AS group_color
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    JOIN category_groups g ON g.id = c.group_id
    WHERE t.date LIKE ?
  `;
  const params: (string | number)[] = [likeMonth];

  if (categoryFilterNone) {
    sql += ' AND 1 = 0';
  } else if (categoryFilterSubset) {
    const placeholders = subsetIds.map(() => '?').join(',');
    sql += ` AND t.category_id IN (${placeholders})`;
    for (const cid of subsetIds) {
      params.push(cid);
    }
  }

  if (search) {
    const term = `%${search.toLowerCase()}%`;
    sql += ` AND (
      LOWER(COALESCE(NULLIF(TRIM(t.merchant), ''), t.description)) LIKE ?
      OR LOWER(COALESCE(t.original_statement, '')) LIKE ?
      OR LOWER(COALESCE(t.notes, '')) LIKE ?
    )`;
    params.push(term, term, term);
  }

  sql += ' ORDER BY t.date DESC, t.created_at DESC';

  const rawTx = db.prepare(sql).all(...params) as DbTxRow[];
  const transactions = rawTx.map(mapDbTxToTransaction);

  let income: IncomeActual[] = [];
  if (includeIncome) {
    let incSql = `
      SELECT ia.id, ia.date, ia.source_id, s.name AS source_name,
             ia.amount_cents, ia.description, ia.import_hash, ia.created_at
      FROM income_actuals ia
      JOIN income_sources s ON s.id = ia.source_id
      WHERE ia.date LIKE ?
    `;
    const incParams: (string | number)[] = [likeMonth];
    if (search) {
      const term = `%${search.toLowerCase()}%`;
      incSql += " AND LOWER(COALESCE(ia.description, '')) LIKE ?";
      incParams.push(term);
    }
    incSql += ' ORDER BY ia.date DESC, ia.created_at DESC';
    const rawInc = db.prepare(incSql).all(...incParams) as DbIncRow[];
    income = rawInc.map(mapDbIncToIncomeActual);
  }

  const expenseCents = transactions.reduce(
    (s, t) => s + Math.abs(t.amountCents),
    0
  );
  const incomeCents = income.reduce((s, i) => s + i.amountCents, 0);
  const netCents = incomeCents - expenseCents;
  const count = transactions.length + income.length;

  return {
    transactions,
    income,
    totals: { expenseCents, incomeCents, netCents, count },
  };
}

function registerIpcHandlers() {
  ipcMain.handle('getGroups', () => {
    const groups = db
      .prepare('SELECT * FROM category_groups ORDER BY sort_order ASC, id ASC')
      .all() as {
      id: number;
      name: string;
      color: string;
      sort_order: number;
    }[];
    const getCats = db.prepare(
      'SELECT * FROM categories WHERE group_id = ? ORDER BY sort_order ASC, id ASC'
    );
    return groups.map((g) => {
      const cats = getCats.all(g.id) as {
        id: number;
        group_id: number;
        name: string;
        sort_order: number;
      }[];
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        sort_order: g.sort_order,
        categories: cats.map((c) => ({
          id: c.id,
          group_id: c.group_id,
          name: c.name,
          sort_order: c.sort_order,
        })),
      };
    });
  });

  ipcMain.handle('createGroup', (_, payload: CreateGroupPayload) => {
    const { name, color } = payload;
    const row = db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM category_groups'
      )
      .get() as { n: number };
    const r = db
      .prepare(
        'INSERT INTO category_groups (name, color, sort_order) VALUES (?, ?, ?)'
      )
      .run(name, color || '#748B9D', row.n);
    return { id: Number(r.lastInsertRowid) };
  });

  ipcMain.handle('createCategory', (_, payload: CreateCategoryPayload) => {
    const { group_id, name } = payload;
    const row = db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories WHERE group_id = ?'
      )
      .get(group_id) as { n: number };
    const r = db
      .prepare(
        'INSERT INTO categories (group_id, name, sort_order) VALUES (?, ?, ?)'
      )
      .run(group_id, name, row.n);
    return { id: Number(r.lastInsertRowid) };
  });

  ipcMain.handle('deleteCategory', (_, id: number) => {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  });

  ipcMain.handle('deleteGroup', (_, id: number) => {
    db.prepare('DELETE FROM category_groups WHERE id = ?').run(id);
  });

  ipcMain.handle('getBudget', (_, monthKey: string) =>
    getBudgetData(monthKey)
  );

  ipcMain.handle(
    'setBudgetAmount',
    (_, categoryId: number, monthKey: string, amountCents: number) => {
      db.prepare(
        `INSERT INTO budgets (category_id, month_key, amount_cents)
       VALUES (?, ?, ?)
       ON CONFLICT(category_id, month_key) DO UPDATE SET
         amount_cents = excluded.amount_cents`
      ).run(categoryId, monthKey, amountCents);
    }
  );

  ipcMain.handle('getIncomeSources', () => {
    return db
      .prepare(
        'SELECT id, name FROM income_sources ORDER BY sort_order ASC, id ASC'
      )
      .all() as { id: number; name: string }[];
  });

  ipcMain.handle(
    'createIncomeSource',
    (_, payload: CreateIncomeSourcePayload) => {
      const { name } = payload;
      const row = db
        .prepare(
          'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM income_sources'
        )
        .get() as { n: number };
      const r = db
        .prepare('INSERT INTO income_sources (name, sort_order) VALUES (?, ?)')
        .run(name, row.n);
      return { id: Number(r.lastInsertRowid) };
    }
  );

  ipcMain.handle(
    'setIncomeBudget',
    (_, sourceId: number, monthKey: string, amountCents: number) => {
      db.prepare(
        `INSERT INTO income_budgets (source_id, month_key, amount_cents)
       VALUES (?, ?, ?)
       ON CONFLICT(source_id, month_key) DO UPDATE SET
         amount_cents = excluded.amount_cents`
      ).run(sourceId, monthKey, amountCents);
    }
  );

  ipcMain.handle('getTransactions', (_, filters: TransactionFilters) => {
    return getTransactionsList(filters);
  });

  ipcMain.handle(
    'updateTransactionCategory',
    (_, id: number, categoryId: number) => {
      const r = db
        .prepare('UPDATE transactions SET category_id = ? WHERE id = ?')
        .run(categoryId, id);
      if (r.changes === 0) {
        throw new Error('Transaction not found or could not be updated.');
      }
    }
  );

  ipcMain.handle('deleteTransaction', (_, id: number) => {
    const r = db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
    if (r.changes === 0) {
      throw new Error('Transaction not found.');
    }
  });

  ipcMain.handle('deleteIncomeActual', (_, id: number) => {
    const r = db.prepare('DELETE FROM income_actuals WHERE id = ?').run(id);
    if (r.changes === 0) {
      throw new Error('Income entry not found.');
    }
  });

  ipcMain.handle('addTransaction', (_, payload: AddTransactionPayload) => {
    const { category_id, date, description, amount_cents } = payload;
    const desc = description ?? '';
    const r = db
      .prepare(
        `INSERT INTO transactions (category_id, date, description, merchant, amount_cents)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(category_id, date, desc, desc, amount_cents);
    return { id: Number(r.lastInsertRowid) };
  });

  ipcMain.handle('openCSVDialog', async () => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose Monarch CSV export',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return r.filePaths[0];
  });

  ipcMain.handle('parseCSV', (_, filePath: string) => {
    return parseMonarchCSV(filePath);
  });

  ipcMain.handle('getCategoryMappings', () => {
    const { catNames, incomeNames } = loadMappingNameLookups();
    const mappingRows = db
      .prepare(
        `SELECT id, external_name, target_type, target_id
         FROM category_mappings WHERE source = ? ORDER BY external_name COLLATE NOCASE`
      )
      .all(MAPPING_SOURCE) as MappingDbRow[];
    return mappingRows.map((row) =>
      toCategoryMapping(row, catNames, incomeNames)
    );
  });

  ipcMain.handle(
    'saveCategoryMapping',
    (_, input: SaveCategoryMappingInput) => {
      const external_name = input.externalName.trim();
      db.prepare(
        `INSERT INTO category_mappings (source, external_name, target_type, target_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(source, external_name) DO UPDATE SET
           target_type = excluded.target_type,
           target_id = excluded.target_id`
      ).run(
        MAPPING_SOURCE,
        external_name,
        input.targetType,
        input.targetId
      );
    }
  );

  ipcMain.handle('commitImport', (_, rows: CommitImportRow[]) => {
    let imported = 0;
    let skipped = 0;
    let duplicates = 0;

    const dupTx = db.prepare(
      'SELECT 1 AS ok FROM transactions WHERE import_hash = ? LIMIT 1'
    );
    const dupInc = db.prepare(
      'SELECT 1 AS ok FROM income_actuals WHERE import_hash = ? LIMIT 1'
    );

    const insertTx = db.prepare(
      `INSERT INTO transactions (
         category_id, date, description, merchant, account, original_statement, notes,
         amount_cents, source, import_hash
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'csv', ?)`
    );
    const insertInc = db.prepare(
      `INSERT INTO income_actuals (source_id, date, description, amount_cents, import_hash)
       VALUES (?, ?, ?, ?, ?)`
    );

    const runBatch = db.transaction((batch: CommitImportRow[]) => {
      for (const row of batch) {
        if (row.skip) {
          skipped++;
          continue;
        }
        if (dupTx.get(row.importHash) || dupInc.get(row.importHash)) {
          duplicates++;
          continue;
        }
        if (row.targetType === 'category' && row.targetId != null) {
          const stored = -row.amountCents;
          insertTx.run(
            row.targetId,
            row.date,
            row.merchant,
            row.merchant,
            row.account ?? '',
            row.originalStatement,
            row.notes,
            stored,
            row.importHash
          );
          imported++;
        } else if (
          row.targetType === 'income_source' &&
          row.targetId != null
        ) {
          const stored = Math.abs(row.amountCents);
          insertInc.run(
            row.targetId,
            row.date,
            row.merchant,
            stored,
            row.importHash
          );
          imported++;
        } else {
          skipped++;
        }
      }
    });

    runBatch(rows);
    return { imported, skipped, duplicates };
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#F6F5F0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev =
    process.env.NODE_ENV === 'development' ||
    process.env.ELECTRON_IS_DEV === '1';

  win.webContents.on('preload-error', (_event, preloadPath, err) => {
    console.error('[Spend] preload-error', preloadPath, err);
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  try {
    initDb();
    registerIpcHandlers();
    createWindow();
  } catch (err) {
    console.error('[Spend] startup failed:', err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    app.quit();
    process.exit(1);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (db) {
    db.close();
  }
  if (process.platform !== 'darwin') app.quit();
});

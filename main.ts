import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  nativeImage,
  shell,
} from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import Database from 'better-sqlite3';
import type {
  AddTransactionPayload,
  AppPreferences,
  BudgetFrequency,
  BudgetPayload,
  CreateCategoryForImportPayload,
  CreateCategoryPayload,
  CreateGroupPayload,
  CreateIncomeSourcePayload,
  MoveGroupCategoriesPayload,
  ResetDatabaseMode,
  ReorderEntityPayload,
  SetBudgetDetailsInput,
  TrendCategorySlice,
  TrendData,
  TrendGroupLegendItem,
  TrendGroupSlice,
  TrendIncomeLineSlice,
  TrendIncomeSlice,
  TrendMonthSnapshot,
  TrendRange,
  TrendTopCategory,
  MerchantInsights,
  UpdateCategoryPayload,
  UpdateGroupPayload,
  UpdateIncomeSourcePayload,
  BudgetSuggestions,
  SeedDefaultSetupResult,
  SetupStatus,
} from './ipc-contract.js';
import {
  DEFAULT_CATEGORY_GROUPS,
  DEFAULT_INCOME_SOURCES,
} from './defaultSetup.js';
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
  ParseCSVOptions,
  ParsedRow,
  DeleteLedgerRowsInput,
  SaveCategoryMappingInput,
} from './src/types/import.js';
import {
  DEFAULT_IMPORT_PROFILE_ID,
  resolveImportMapping,
  getCSVProfile,
} from './src/utils/csv-profiles.js';
import {
  parseProfileCSV,
  peekCSV,
  profileNameForId,
} from './src/utils/csvProfileParser.js';
import { computeImportHash } from './importHash.js';
import {
  analyzeImportCandidates,
  findDuplicatePairs,
  type DedupeRow,
} from './dedupe.js';
import {
  loadMappingNameLookups,
  toCategoryMapping,
  type MappingDbRow,
} from './importMapping.js';
import { runCommitImport } from './importCommit.js';
import {
  commitMappedMonarchRows,
  isMonarchSyncEnabled,
  syncFromMonarch,
} from './monarch-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load .env.build into process.env (only keys not already set). */
function loadBuildEnv() {
  const candidates = [
    path.join(__dirname, '..', '.env.build'),
    path.join(process.cwd(), '.env.build'),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    } catch (e) {
      console.warn('[Spend] could not read .env.build:', e);
    }
    break;
  }
}

loadBuildEnv();

/** Append one line to /tmp (or TMPDIR) for debugging dock-bounce exits; open `spend-electron-boot.log`. */
function appendBootLog(message: string) {
  try {
    const base = process.env.TMPDIR || '/tmp';
    fs.appendFileSync(
      path.join(base, 'spend-electron-boot.log'),
      `${new Date().toISOString()} ${message}\n`
    );
  } catch {
    /** */
  }
}

appendBootLog(
  `main loaded __dirname=${__dirname} isPackaged=${app.isPackaged} exec=${process.execPath}`
);

app.on('web-contents-created', (_e, contents) => {
  contents.on('render-process-gone', (_ev, details) => {
    appendBootLog(
      `render-process-gone reason=${details.reason} exitCode=${details.exitCode}`
    );
    try {
      dialog.showErrorBox(
        'Spend display process exited',
        `${String(details.reason)} (exit ${details.exitCode}).\n\nDetails in: ${path.join(process.env.TMPDIR || '/tmp', 'spend-electron-boot.log')}`
      );
    } catch {
      /** */
    }
  });
});

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
  appendBootLog(`uncaughtException: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  try {
    dialog.showErrorBox(
      'Spend hit an error',
      err instanceof Error ? err.message : String(err)
    );
  } catch {
    /** */
  }
});
process.on('unhandledRejection', (reason) => {
  console.error('[Spend] unhandledRejection:', reason);
  appendBootLog(`unhandledRejection: ${String(reason)}`);
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
  tryExec(
    "ALTER TABLE budgets ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly'"
  );
  tryExec('ALTER TABLE budgets ADD COLUMN annual_amount_cents INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS month_notes (
      month_key TEXT PRIMARY KEY,
      note TEXT NOT NULL DEFAULT ''
    )
  `);
}

const BUDGET_FREQUENCIES = new Set<string>([
  'monthly',
  'quarterly',
  'yearly',
  'bimonthly',
]);

function normalizeBudgetFrequency(raw: string | null | undefined): BudgetFrequency {
  const s = raw ?? 'monthly';
  return BUDGET_FREQUENCIES.has(s) ? (s as BudgetFrequency) : 'monthly';
}

function monthKeyToYtdBounds(monthKey: string): { start: string; end: string } {
  const [ys, ms] = monthKey.split('-');
  const year = Number(ys);
  const month = Number(ms);
  const last = new Date(year, month, 0);
  const dd = String(last.getDate()).padStart(2, '0');
  const mm = String(last.getMonth() + 1).padStart(2, '0');
  return { start: `${year}-01-01`, end: `${year}-${mm}-${dd}` };
}

function monthNumberFromMonthKey(monthKey: string): number {
  return Number(monthKey.split('-')[1]);
}

function monthKeysForCalendarYear(monthKey: string): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!m) {
    throw new Error('Invalid monthKey (expected YYYY-MM).');
  }
  const y = m[1];
  return Array.from(
    { length: 12 },
    (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`
  );
}

function initDb() {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  const dbPath = getDbPath();
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.ELECTRON_IS_DEV === '1'
  ) {
    console.info('[Spend] database file:', dbPath);
  }
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  /** Stronger durability than NORMAL — budget writes should survive abrupt dev-server / terminal stop. */
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  /** Must run after schema: ADD COLUMN for legacy DBs, then index (not in schema.sql). */
  runSqliteMigrations();
}

/**
 * WAL data lives in `-wal` until checkpointed. Merging to the main file + close ensures
 * edits persist when the dev terminal sends SIGINT/SIGTERM (often without firing `before-quit`).
 */
function flushAndCloseDb() {
  try {
    if (db?.open) {
      db.pragma('wal_checkpoint(TRUNCATE)');
    }
  } catch (e) {
    console.error('[Spend] wal_checkpoint:', e);
  }
  try {
    if (db?.open) {
      db.close();
    }
  } catch (e) {
    console.error('[Spend] db.close:', e);
  }
}

const SETTINGS_KEY_DEFAULT_MONTH = 'default_month_on_launch';
const SETTINGS_KEY_COLOR_MODE = 'color_mode';
const SETTINGS_KEY_LAST_IMPORT_PROFILE = 'lastImportProfile';
const SETTINGS_KEY_FIRST_RUN = 'first_run_complete';
const SETTINGS_KEY_CHECKLIST_DISMISSED = 'checklist_dismissed';
const SETTINGS_KEY_VIEWED_TRANSACTIONS = 'viewed_transactions';
const SETTINGS_KEY_WIZARD_SEEN = 'onboarding_wizard_seen';

function getSettingBool(key: string): boolean {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value === 'true';
}

function setSettingBool(key: string, value: boolean) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    key,
    value ? 'true' : 'false'
  );
}

/**
 * Skip wizard/checklist for installs that already had data before onboarding shipped.
 * New users who go through the wizard set `wizardSeen`; only users without that flag
 * and pre-existing groups + transactions are treated as returning upgrades.
 */
function migrateExistingUserOnboarding() {
  const groupCount = (
    db.prepare('SELECT COUNT(*) AS c FROM category_groups').get() as {
      c: number;
    }
  ).c;
  const txCount = (
    db.prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number }
  ).c;
  const hadDataBeforeOnboarding = groupCount > 0 && txCount > 0;
  const wizardSeen = getSettingBool(SETTINGS_KEY_WIZARD_SEEN);

  if (!hadDataBeforeOnboarding || wizardSeen) return;

  if (!getSettingBool(SETTINGS_KEY_FIRST_RUN)) {
    setSettingBool(SETTINGS_KEY_FIRST_RUN, true);
  }
  if (!getSettingBool(SETTINGS_KEY_CHECKLIST_DISMISSED)) {
    setSettingBool(SETTINGS_KEY_CHECKLIST_DISMISSED, true);
  }
  if (!getSettingBool(SETTINGS_KEY_VIEWED_TRANSACTIONS)) {
    setSettingBool(SETTINGS_KEY_VIEWED_TRANSACTIONS, true);
  }
}

function getPreferencesFromDb(): AppPreferences {
  migrateExistingUserOnboarding();
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(SETTINGS_KEY_DEFAULT_MONTH) as { value: string } | undefined;
  const v = row?.value;
  const defaultMonthOnLaunch =
    v === 'current' || v === 'last_viewed' ? v : 'last_viewed';
  const colorRow = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(SETTINGS_KEY_COLOR_MODE) as { value: string } | undefined;
  const colorMode = colorRow?.value === 'dark' ? 'dark' : 'light';
  return {
    defaultMonthOnLaunch,
    colorMode,
    firstRunComplete: getSettingBool(SETTINGS_KEY_FIRST_RUN),
    checklistDismissed: getSettingBool(SETTINGS_KEY_CHECKLIST_DISMISSED),
    viewedTransactions: getSettingBool(SETTINGS_KEY_VIEWED_TRANSACTIONS),
    wizardSeen: getSettingBool(SETTINGS_KEY_WIZARD_SEEN),
  };
}

function setPreferencesInDb(partial: Partial<AppPreferences>) {
  if (partial.defaultMonthOnLaunch != null) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      SETTINGS_KEY_DEFAULT_MONTH,
      partial.defaultMonthOnLaunch
    );
  }
  if (partial.colorMode != null) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      SETTINGS_KEY_COLOR_MODE,
      partial.colorMode
    );
  }
  if (partial.firstRunComplete != null) {
    setSettingBool(SETTINGS_KEY_FIRST_RUN, partial.firstRunComplete);
  }
  if (partial.checklistDismissed != null) {
    setSettingBool(SETTINGS_KEY_CHECKLIST_DISMISSED, partial.checklistDismissed);
  }
  if (partial.viewedTransactions != null) {
    setSettingBool(SETTINGS_KEY_VIEWED_TRANSACTIONS, partial.viewedTransactions);
  }
  if (partial.wizardSeen != null) {
    setSettingBool(SETTINGS_KEY_WIZARD_SEEN, partial.wizardSeen);
  }
}

function getSetupStatusFromDb(monthKey: string): SetupStatus {
  migrateExistingUserOnboarding();
  const groupCount = (
    db.prepare('SELECT COUNT(*) AS c FROM category_groups').get() as {
      c: number;
    }
  ).c;
  const categoryCount = (
    db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number }
  ).c;
  const txCount = (
    db.prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number }
  ).c;
  const incomeActualCount = (
    db.prepare('SELECT COUNT(*) AS c FROM income_actuals').get() as {
      c: number;
    }
  ).c;
  const categoriesWithBudgetCount = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT category_id) AS c FROM budgets
         WHERE month_key = ? AND amount_cents > 0`
      )
      .get(monthKey) as { c: number }
  ).c;
  return {
    firstRunComplete: getSettingBool(SETTINGS_KEY_FIRST_RUN),
    checklistDismissed: getSettingBool(SETTINGS_KEY_CHECKLIST_DISMISSED),
    viewedTransactions: getSettingBool(SETTINGS_KEY_VIEWED_TRANSACTIONS),
    groupCount,
    categoryCount,
    transactionCount: txCount + incomeActualCount,
    categoriesWithBudgetCount,
  };
}

function seedDefaultSetupInDb(): SeedDefaultSetupResult {
  const existingGroups = (
    db.prepare('SELECT COUNT(*) AS c FROM category_groups').get() as {
      c: number;
    }
  ).c;
  if (existingGroups > 0) {
    const categoryCount = (
      db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number }
    ).c;
    const incomeSourceCount = (
      db.prepare('SELECT COUNT(*) AS c FROM income_sources').get() as {
        c: number;
      }
    ).c;
    return {
      groupCount: existingGroups,
      categoryCount,
      incomeSourceCount,
      created: false,
    };
  }

  const insertGroup = db.prepare(
    `INSERT INTO category_groups (name, color, sort_order) VALUES (?, ?, ?)`
  );
  const insertCategory = db.prepare(
    `INSERT INTO categories (group_id, name, sort_order) VALUES (?, ?, ?)`
  );
  const insertIncome = db.prepare(
    `INSERT INTO income_sources (name, sort_order) VALUES (?, ?)`
  );

  let categoryCount = 0;
  const run = db.transaction(() => {
    DEFAULT_CATEGORY_GROUPS.forEach((g, gi) => {
      const gr = insertGroup.run(g.name, g.color, gi + 1);
      const groupId = Number(gr.lastInsertRowid);
      g.categories.forEach((cat, ci) => {
        insertCategory.run(groupId, cat, ci + 1);
        categoryCount += 1;
      });
    });
    DEFAULT_INCOME_SOURCES.forEach((name, i) => {
      insertIncome.run(name, i + 1);
    });
  });
  run();

  return {
    groupCount: DEFAULT_CATEGORY_GROUPS.length,
    categoryCount,
    incomeSourceCount: DEFAULT_INCOME_SOURCES.length,
    created: true,
  };
}

function suggestionLabel(monthCount: number): string {
  if (monthCount <= 1) return 'Based on last month';
  return `Based on ${monthCount}-month average`;
}

function getBudgetSuggestionsFromDb(monthKey: string): BudgetSuggestions {
  const catRows = db
    .prepare(
      `SELECT category_id AS id, month_key, SUM(ABS(amount_cents)) AS total
       FROM transactions
       WHERE category_id IS NOT NULL AND amount_cents < 0
       GROUP BY category_id, month_key
       ORDER BY month_key DESC`
    )
    .all() as { id: number; month_key: string; total: number }[];

  const byCategory = new Map<number, number[]>();
  for (const row of catRows) {
    const list = byCategory.get(row.id) ?? [];
    list.push(row.total);
    byCategory.set(row.id, list);
  }

  const categories = [...byCategory.entries()].map(([id, totals]) => {
    const avg = Math.round(
      totals.reduce((a, b) => a + b, 0) / totals.length
    );
    return {
      id,
      suggestedCents: avg,
      label: suggestionLabel(totals.length),
    };
  });

  const incomeRows = db
    .prepare(
      `SELECT source_id AS id, month_key, SUM(amount_cents) AS total
       FROM income_actuals
       GROUP BY source_id, month_key
       ORDER BY month_key DESC`
    )
    .all() as { id: number; month_key: string; total: number }[];

  const byIncome = new Map<number, number[]>();
  for (const row of incomeRows) {
    const list = byIncome.get(row.id) ?? [];
    list.push(row.total);
    byIncome.set(row.id, list);
  }

  const income = [...byIncome.entries()].map(([id, totals]) => {
    const avg = Math.round(
      totals.reduce((a, b) => a + b, 0) / totals.length
    );
    return {
      id,
      suggestedCents: avg,
      label: suggestionLabel(totals.length),
    };
  });

  return { categories, income };
}

function validateSpendBackupFile(filePath: string) {
  const probe = new Database(filePath, { readonly: true });
  try {
    const names = new Set(
      (
        probe
          .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
          .all() as { name: string }[]
      ).map((r) => r.name)
    );
    const required = [
      'category_groups',
      'categories',
      'transactions',
      'budgets',
      'income_sources',
      'income_budgets',
      'income_actuals',
      'category_mappings',
    ];
    for (const t of required) {
      if (!names.has(t)) {
        throw new Error(
          `This file is not a valid Spend. backup (missing table: ${t}).`
        );
      }
    }
  } finally {
    probe.close();
  }
}

function reloadAllRendererWindows() {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.reload();
  }
}

function reopenMainDatabaseFromDisk() {
  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  runSqliteMigrations();
}

function replaceDatabaseWithBackupFile(backupPath: string) {
  validateSpendBackupFile(backupPath);
  flushAndCloseDb();
  const dbPath = getDbPath();
  try {
    fs.unlinkSync(`${dbPath}-wal`);
  } catch {
    /** */
  }
  try {
    fs.unlinkSync(`${dbPath}-shm`);
  } catch {
    /** */
  }
  fs.copyFileSync(backupPath, dbPath);
  reopenMainDatabaseFromDisk();
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
    `INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents, frequency, annual_amount_cents)
     SELECT category_id, ?, amount_cents, frequency, annual_amount_cents FROM budgets WHERE month_key = ?`
  ).run(monthKey, prevKey);

  db.prepare(
    `INSERT OR REPLACE INTO income_budgets (source_id, month_key, amount_cents)
     SELECT source_id, ?, amount_cents FROM income_budgets WHERE month_key = ?`
  ).run(monthKey, prevKey);
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

  const { catNames, incomeNames } = loadMappingNameLookups(db);

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
      ? toCategoryMapping(mapRow, MAPPING_SOURCE, catNames, incomeNames)
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

  const { start: ytdStart, end: ytdEnd } = monthKeyToYtdBounds(monthKey);
  const ytdRows = db
    .prepare(
      `SELECT category_id, COALESCE(SUM(amount_cents), 0) AS spent_ytd
       FROM transactions
       WHERE date >= ? AND date <= ?
       GROUP BY category_id`
    )
    .all(ytdStart, ytdEnd) as { category_id: number; spent_ytd: number }[];

  const spentYtdByCat: Record<number, number> = Object.fromEntries(
    ytdRows.map((r) => [r.category_id, r.spent_ytd])
  );

  const monthNum = monthNumberFromMonthKey(monthKey);

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
    `SELECT amount_cents, frequency, annual_amount_cents
     FROM budgets WHERE category_id = ? AND month_key = ?`
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
        | {
            amount_cents: number;
            frequency: string;
            annual_amount_cents: number | null;
          }
        | undefined;
      const budget_cents = b ? b.amount_cents : 0;
      const spent_cents = spentByCat[c.id] ?? 0;
      const rawFreq = normalizeBudgetFrequency(b?.frequency);
      const annualRaw = b?.annual_amount_cents ?? null;
      const isSinking = rawFreq !== 'monthly' && annualRaw != null;
      const frequency: BudgetFrequency = isSinking ? rawFreq : 'monthly';
      const annual_amount_cents = isSinking ? annualRaw : null;

      const spent_ytd_cents = spentYtdByCat[c.id] ?? 0;
      let accumulated_cents: number;
      let remaining_cents: number;
      let is_on_track: boolean;
      if (isSinking && annual_amount_cents != null) {
        const monthlySetAside = Math.round(annual_amount_cents / 12);
        accumulated_cents = monthlySetAside * monthNum;
        remaining_cents = accumulated_cents - spent_ytd_cents;
        is_on_track = spent_ytd_cents <= accumulated_cents;
      } else {
        accumulated_cents = budget_cents;
        remaining_cents = budget_cents - spent_cents;
        is_on_track = spent_cents <= budget_cents;
      }

      groupBudget += budget_cents;
      groupSpent += spent_cents;
      return {
        id: c.id,
        name: c.name,
        sort_order: c.sort_order,
        budget_cents,
        spent_cents,
        frequency,
        annual_amount_cents,
        accumulated_cents,
        spent_ytd_cents: isSinking ? spent_ytd_cents : spent_cents,
        remaining_cents,
        is_on_track,
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

function currentMonthKeyMain(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function addMonthsToKey(monthKey: string, delta: number): string {
  const [ys, ms] = monthKey.split('-').map(Number);
  const d = new Date(ys, ms - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function enumerateMonthKeys(start: string, end: string): string[] {
  if (start > end) return [];
  const keys: string[] = [];
  let k = start;
  for (;;) {
    keys.push(k);
    if (k === end) break;
    k = addMonthsToKey(k, 1);
  }
  return keys;
}

function resolveTrendWindow(
  range: TrendRange
): { startMonthKey: string; endMonthKey: string } {
  const end = currentMonthKeyMain();
  if (range === '1m') {
    // The month just gone, not the one in progress — a complete month to read.
    const prev = addMonthsToKey(end, -1);
    return { startMonthKey: prev, endMonthKey: prev };
  }
  if (range === 'ytd') {
    const y = end.slice(0, 4);
    return { startMonthKey: `${y}-01`, endMonthKey: end };
  }
  if (range === 'all') {
    const txMin = db
      .prepare('SELECT MIN(substr(date, 1, 7)) AS m FROM transactions')
      .get() as { m: string | null };
    const incMin = db
      .prepare('SELECT MIN(substr(date, 1, 7)) AS m FROM income_actuals')
      .get() as { m: string | null };
    let start = txMin.m ?? incMin.m;
    if (start && incMin.m && incMin.m < start) start = incMin.m;
    if (!start) start = end;
    if (start > end) start = end;
    return { startMonthKey: start, endMonthKey: end };
  }
  const n = range === '3m' ? 3 : range === '6m' ? 6 : 12;
  return { startMonthKey: addMonthsToKey(end, -(n - 1)), endMonthKey: end };
}

function getTrendsData(range: TrendRange): TrendData {
  if (!['1m', '3m', '6m', '12m', 'ytd', 'all'].includes(range)) {
    throw new Error('Invalid trend range.');
  }
  const { startMonthKey, endMonthKey } = resolveTrendWindow(range);
  const monthKeys = enumerateMonthKeys(startMonthKey, endMonthKey);
  const rangeCrossesYears =
    monthKeys.length > 0 &&
    monthKeys[0].slice(0, 4) !== monthKeys[monthKeys.length - 1].slice(0, 4);

  const txCount = (
    db.prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number }
  ).c;
  const incomeRowCount = (
    db.prepare('SELECT COUNT(*) AS c FROM income_actuals').get() as { c: number }
  ).c;
  const hasTrendsData = txCount > 0 || incomeRowCount > 0;

  const groupRows = db
    .prepare(
      `SELECT id, name, color, sort_order FROM category_groups
       ORDER BY sort_order ASC, id ASC`
    )
    .all() as {
    id: number;
    name: string;
    color: string;
    sort_order: number;
  }[];

  const groups: TrendGroupLegendItem[] = groupRows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    sortOrder: r.sort_order,
  }));

  const incomeSourceRows = db
    .prepare(
      `SELECT id, name, sort_order FROM income_sources
       ORDER BY sort_order ASC, id ASC`
    )
    .all() as { id: number; name: string; sort_order: number }[];

  const incomeSources = incomeSourceRows.map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
  }));

  type SpentAgg = {
    mk: string;
    category_id: number;
    category_name: string;
    group_id: number;
    group_name: string;
    color: string;
    sort_order: number;
    spent_cents: number;
  };

  const spentRows = db
    .prepare(
      `SELECT substr(t.date, 1, 7) AS mk,
              c.id AS category_id,
              c.name AS category_name,
              c.group_id,
              g.name AS group_name,
              g.color,
              g.sort_order,
              COALESCE(SUM(t.amount_cents), 0) AS spent_cents
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       JOIN category_groups g ON g.id = c.group_id
       WHERE substr(t.date, 1, 7) >= ? AND substr(t.date, 1, 7) <= ?
       GROUP BY mk, c.id`
    )
    .all(startMonthKey, endMonthKey) as SpentAgg[];

  type IncAgg = {
    mk: string;
    source_id: number;
    source_name: string;
    amt: number;
  };

  const incomeRows = db
    .prepare(
      `SELECT substr(ia.date, 1, 7) AS mk,
              ia.source_id,
              s.name AS source_name,
              COALESCE(SUM(ia.amount_cents), 0) AS amt
       FROM income_actuals ia
       JOIN income_sources s ON s.id = ia.source_id
       WHERE substr(ia.date, 1, 7) >= ? AND substr(ia.date, 1, 7) <= ?
       GROUP BY mk, ia.source_id`
    )
    .all(startMonthKey, endMonthKey) as IncAgg[];

  type IncLineAgg = {
    mk: string;
    source_id: number;
    line_label: string;
    amt: number;
  };

  const incomeLineRows = db
    .prepare(
      `SELECT substr(ia.date, 1, 7) AS mk,
              ia.source_id,
              COALESCE(NULLIF(TRIM(ia.description), ''), '—') AS line_label,
              COALESCE(SUM(ia.amount_cents), 0) AS amt
       FROM income_actuals ia
       WHERE substr(ia.date, 1, 7) >= ? AND substr(ia.date, 1, 7) <= ?
       GROUP BY mk, ia.source_id, line_label`
    )
    .all(startMonthKey, endMonthKey) as IncLineAgg[];

  type BudgetAgg = { month_key: string; total_cents: number };
  const budgetRows = db
    .prepare(
      `SELECT month_key, COALESCE(SUM(amount_cents), 0) AS total_cents
       FROM budgets
       WHERE month_key >= ? AND month_key <= ?
       GROUP BY month_key`
    )
    .all(startMonthKey, endMonthKey) as BudgetAgg[];

  const budgetByMonth = new Map<string, number>(
    budgetRows.map((r) => [r.month_key, r.total_cents])
  );

  type TopCatRow = {
    category_id: number;
    category_name: string;
    group_id: number;
    group_name: string;
    color: string;
    total_cents: number;
  };

  const topCatRows = db
    .prepare(
      `SELECT c.id AS category_id,
              c.name AS category_name,
              c.group_id,
              g.name AS group_name,
              g.color,
              COALESCE(SUM(t.amount_cents), 0) AS total_cents
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       JOIN category_groups g ON g.id = c.group_id
       WHERE substr(t.date, 1, 7) >= ? AND substr(t.date, 1, 7) <= ?
       GROUP BY c.id
       HAVING total_cents > 0
       ORDER BY total_cents DESC
       LIMIT 5`
    )
    .all(startMonthKey, endMonthKey) as TopCatRow[];

  const topCategories: TrendTopCategory[] = topCatRows.map((r) => ({
    categoryId: r.category_id,
    name: r.category_name,
    groupId: r.group_id,
    groupName: r.group_name,
    color: r.color,
    totalCents: r.total_cents,
  }));

  const months: TrendMonthSnapshot[] = monthKeys.map((mk) => {
    const { label, year } = (() => {
      const [y, m] = mk.split('-').map(Number);
      const d = new Date(y, m - 1, 1);
      const short = d.toLocaleString('en-US', { month: 'short' });
      return {
        label: rangeCrossesYears ? `${short} '${String(y).slice(-2)}` : short,
        year: y,
      };
    })();

    const snap: TrendMonthSnapshot = {
      monthKey: mk,
      label,
      year,
      totalBudgetCents: budgetByMonth.get(mk) ?? 0,
      totalSpendingCents: 0,
      totalIncomeCents: 0,
      netCents: 0,
      byGroup: [],
      byCategory: [],
      byIncomeSource: [],
      byIncomeLine: [],
    };
    return snap;
  });

  const monthIndex = new Map(months.map((m, i) => [m.monthKey, i]));

  for (const r of spentRows) {
    const idx = monthIndex.get(r.mk);
    if (idx === undefined) continue;
    const m = months[idx];
    const cat: TrendCategorySlice = {
      categoryId: r.category_id,
      name: r.category_name,
      groupId: r.group_id,
      groupName: r.group_name,
      color: r.color,
      amountCents: r.spent_cents,
    };
    m.byCategory.push(cat);
  }

  for (const m of months) {
    const gmap = new Map<number, TrendGroupSlice>();
    for (const c of m.byCategory) {
      const prev = gmap.get(c.groupId);
      if (prev) {
        prev.amountCents += c.amountCents;
      } else {
        gmap.set(c.groupId, {
          groupId: c.groupId,
          name: c.groupName,
          color: c.color,
          sortOrder: groupRows.find((g) => g.id === c.groupId)?.sort_order ?? 0,
          amountCents: c.amountCents,
        });
      }
    }
    m.byGroup = [...gmap.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    );
    m.byCategory.sort((a, b) => a.name.localeCompare(b.name));
    m.totalSpendingCents = m.byCategory.reduce((s, c) => s + c.amountCents, 0);
  }

  for (const r of incomeRows) {
    const idx = monthIndex.get(r.mk);
    if (idx === undefined) continue;
    const m = months[idx];
    const slice: TrendIncomeSlice = {
      sourceId: r.source_id,
      name: r.source_name,
      amountCents: r.amt,
    };
    m.byIncomeSource.push(slice);
    m.totalIncomeCents += r.amt;
  }

  for (const r of incomeLineRows) {
    const idx = monthIndex.get(r.mk);
    if (idx === undefined) continue;
    const m = months[idx];
    const lineSlice: TrendIncomeLineSlice = {
      sourceId: r.source_id,
      label: r.line_label,
      amountCents: r.amt,
    };
    m.byIncomeLine.push(lineSlice);
  }

  for (const m of months) {
    m.byIncomeSource.sort((a, b) => a.name.localeCompare(b.name));
    m.byIncomeLine.sort(
      (a, b) =>
        a.sourceId - b.sourceId || a.label.localeCompare(b.label)
    );
    m.netCents = m.totalIncomeCents - m.totalSpendingCents;
  }

  let monthsWithActivity = 0;
  for (const m of months) {
    if (m.totalSpendingCents > 0 || m.totalIncomeCents > 0) {
      monthsWithActivity += 1;
    }
  }

  return {
    range,
    startMonthKey,
    endMonthKey,
    months,
    topCategories,
    groups,
    incomeSources,
    monthsWithActivity,
    hasTrendsData,
  };
}

function getTransactionsList(filters: TransactionFilters): TransactionListResult {
  const monthKey = filters.monthKey;
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error('Invalid monthKey (expected YYYY-MM).');
  }
  const likeMonth = `${monthKey}%`;
  const dr = filters.dateRange;
  const useRange =
    dr &&
    /^\d{4}-\d{2}$/.test(dr.startMonthKey) &&
    /^\d{4}-\d{2}$/.test(dr.endMonthKey) &&
    dr.startMonthKey <= dr.endMonthKey;
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

  const incomeOnlySourceIds = (
    Array.isArray(filters.incomeOnlySourceIds)
      ? filters.incomeOnlySourceIds
      : []
  ).filter((id) => Number.isFinite(id) && id > 0);
  const incomeOnly = incomeOnlySourceIds.length > 0;

  if (incomeOnly) {
    categoryFilterNone = true;
    categoryFilterSubset = false;
  }

  const categoryFilterActive =
    categoryFilterNone || categoryFilterSubset;
  let includeIncome =
    filters.includeIncome !== false && !categoryFilterActive;
  if (incomeOnly) {
    includeIncome = true;
  }
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
    WHERE ${useRange ? 'substr(t.date, 1, 7) >= ? AND substr(t.date, 1, 7) <= ?' : 't.date LIKE ?'}
  `;
  const params: (string | number)[] = useRange
    ? [dr!.startMonthKey, dr!.endMonthKey]
    : [likeMonth];

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
      WHERE ${useRange ? 'substr(ia.date, 1, 7) >= ? AND substr(ia.date, 1, 7) <= ?' : 'ia.date LIKE ?'}
    `;
    const incParams: (string | number)[] = useRange
      ? [dr!.startMonthKey, dr!.endMonthKey]
      : [likeMonth];
    if (incomeOnly) {
      const ph = incomeOnlySourceIds.map(() => '?').join(',');
      incSql += ` AND ia.source_id IN (${ph})`;
      for (const sid of incomeOnlySourceIds) {
        incParams.push(sid);
      }
    }
    const incLineLbl = filters.incomeLineLabel;
    if (incLineLbl != null && incLineLbl !== '') {
      if (incLineLbl === '—') {
        incSql += " AND TRIM(COALESCE(ia.description, '')) = ''";
      } else {
        incSql += " AND TRIM(COALESCE(ia.description, '')) = ?";
        incParams.push(incLineLbl);
      }
    }
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

function merchantMatchWhere(alias = 't'): string {
  return `LOWER(TRIM(COALESCE(NULLIF(TRIM(${alias}.merchant), ''), ${alias}.description))) = ?`;
}

function inclusiveMonthSpanMonths(firstMk: string, lastMk: string): number {
  const pa = /^(\d{4})-(\d{2})$/.exec(firstMk);
  const pb = /^(\d{4})-(\d{2})$/.exec(lastMk);
  if (!pa || !pb) return 1;
  const y1 = Number(pa[1]);
  const m1 = Number(pa[2]);
  const y2 = Number(pb[1]);
  const m2 = Number(pb[2]);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

function lastSixMonthKeysFrom(endMonthKey: string): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(endMonthKey);
  if (!m) return [];
  let y = Number(m[1]);
  let mo = Number(m[2]);
  const keys: string[] = [];
  for (let i = 0; i < 6; i++) {
    keys.push(`${y}-${String(mo).padStart(2, '0')}`);
    mo -= 1;
    if (mo < 1) {
      mo = 12;
      y -= 1;
    }
  }
  return keys.reverse();
}

function getMerchantInsightsData(merchantName: string): MerchantInsights {
  const trim = merchantName.trim();
  if (!trim) {
    throw new Error('Merchant name is required.');
  }
  const norm = trim.toLowerCase();
  const match = merchantMatchWhere('t');

  const agg = db
    .prepare(
      `SELECT
         COALESCE(SUM(ABS(t.amount_cents)), 0) AS total_cents,
         COUNT(*) AS cnt,
         MIN(t.date) AS first_d,
         MAX(t.date) AS last_d
       FROM transactions t
       WHERE ${match}`
    )
    .get(norm) as {
    total_cents: number;
    cnt: number;
    first_d: string | null;
    last_d: string | null;
  };

  const transactionCount = Number(agg.cnt) || 0;
  const totalCents = Math.round(Number(agg.total_cents) || 0);
  const averageCents =
    transactionCount > 0 ? Math.round(totalCents / transactionCount) : 0;

  const firstDate = agg.first_d ?? '';
  const lastDate = agg.last_d ?? '';
  const firstMk = firstDate.slice(0, 7);
  const lastMk = lastDate.slice(0, 7);
  const monthSpan =
    firstMk.length === 7 && lastMk.length === 7
      ? inclusiveMonthSpanMonths(firstMk, lastMk)
      : 1;
  const frequencyPerMonth =
    monthSpan > 0 ? transactionCount / monthSpan : transactionCount;

  const top = db
    .prepare(
      `SELECT t.category_id AS id, c.name AS name, g.name AS group_name, g.color AS group_color
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       JOIN category_groups g ON g.id = c.group_id
       WHERE ${match}
       GROUP BY t.category_id
       ORDER BY COUNT(*) DESC
       LIMIT 1`
    )
    .get(norm) as
    | { id: number; name: string; group_name: string; group_color: string }
    | undefined;

  const topCategory = top
    ? {
        id: top.id,
        name: top.name,
        groupName: top.group_name,
        groupColor: top.group_color,
      }
    : {
        id: 0,
        name: '—',
        groupName: '',
        groupColor: '#888888',
      };

  const endMk = lastMk.length === 7 ? lastMk : '';
  const months = endMk ? lastSixMonthKeysFrom(endMk) : [];
  const monthlySpending: Array<{ monthKey: string; totalCents: number }> = [];
  if (months.length > 0) {
    const rows = db
      .prepare(
        `SELECT substr(t.date, 1, 7) AS mk, SUM(ABS(t.amount_cents)) AS total
         FROM transactions t
         WHERE ${match}
         GROUP BY mk`
      )
      .all(norm) as { mk: string; total: number }[];
    const map = new Map(
      rows.map((r) => [r.mk, Math.round(Number(r.total) || 0)])
    );
    for (const mk of months) {
      monthlySpending.push({ monthKey: mk, totalCents: map.get(mk) ?? 0 });
    }
  }

  return {
    totalCents,
    transactionCount,
    averageCents,
    firstDate,
    lastDate,
    frequencyPerMonth,
    topCategory,
    monthlySpending,
  };
}

function getMonthNoteRow(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return '';
  }
  const row = db
    .prepare('SELECT note FROM month_notes WHERE month_key = ?')
    .get(monthKey) as { note: string } | undefined;
  return row?.note ?? '';
}

function setMonthNoteRow(monthKey: string, note: string): void {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error('Invalid monthKey (expected YYYY-MM).');
  }
  const t = note.trim();
  if (t === '') {
    db.prepare('DELETE FROM month_notes WHERE month_key = ?').run(monthKey);
  } else {
    db.prepare(
      `INSERT INTO month_notes (month_key, note) VALUES (?, ?)
       ON CONFLICT(month_key) DO UPDATE SET note = excluded.note`
    ).run(monthKey, t);
  }
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

  ipcMain.handle(
    'createCategoryForImport',
    (_, payload: CreateCategoryForImportPayload) => {
      const catNameRaw = (payload.categoryName ?? '').trim();
      if (!catNameRaw) {
        throw new Error('Category name is required.');
      }
      const ng = payload.newGroup;
      const eg = payload.existingGroupId;
      const hasNew = ng != null;
      const hasExisting = eg != null && Number.isFinite(eg);
      if (hasNew && hasExisting) {
        throw new Error(
          'Select either an existing group or a new group, not both.'
        );
      }
      if (!hasNew && !hasExisting) {
        throw new Error('Select a group.');
      }

      const run = db.transaction(() => {
        let groupId: number;

        if (hasNew) {
          const gn = (ng!.name ?? '').trim();
          if (!gn) {
            throw new Error('Group name is required.');
          }
          const dupG = db
            .prepare('SELECT 1 AS ok FROM category_groups WHERE name = ?')
            .get(gn) as { ok: number } | undefined;
          if (dupG) {
            throw new Error('A group with this name already exists.');
          }
          const color = (ng!.color ?? '').trim() || '#748B9D';
          const rowG = db
            .prepare(
              'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM category_groups'
            )
            .get() as { n: number };
          const rG = db
            .prepare(
              'INSERT INTO category_groups (name, color, sort_order) VALUES (?, ?, ?)'
            )
            .run(gn, color, rowG.n);
          groupId = Number(rG.lastInsertRowid);
        } else {
          groupId = eg as number;
          const gRow = db
            .prepare('SELECT id, name FROM category_groups WHERE id = ?')
            .get(groupId) as { id: number; name: string } | undefined;
          if (!gRow) {
            throw new Error('Group not found.');
          }
          const dupC = db
            .prepare(
              'SELECT 1 AS ok FROM categories WHERE group_id = ? AND name = ?'
            )
            .get(groupId, catNameRaw) as { ok: number } | undefined;
          if (dupC) {
            throw new Error(
              `A category with this name already exists in ${gRow.name}.`
            );
          }
        }

        const rowC = db
          .prepare(
            'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories WHERE group_id = ?'
          )
          .get(groupId) as { n: number };
        const rC = db
          .prepare(
            'INSERT INTO categories (group_id, name, sort_order) VALUES (?, ?, ?)'
          )
          .run(groupId, catNameRaw, rowC.n);
        const categoryId = Number(rC.lastInsertRowid);
        return { categoryId, groupId };
      });

      return run();
    }
  );

  ipcMain.handle('deleteCategory', (_, id: number) => {
    db.transaction(() => {
      db.prepare(
        `DELETE FROM category_mappings WHERE target_type = 'category' AND target_id = ?`
      ).run(id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    })();
  });

  ipcMain.handle('deleteGroup', (_, id: number) => {
    db.transaction(() => {
      db.prepare(
        `DELETE FROM category_mappings WHERE target_type = 'category' AND target_id IN (SELECT id FROM categories WHERE group_id = ?)`
      ).run(id);
      db.prepare('DELETE FROM category_groups WHERE id = ?').run(id);
    })();
  });

  ipcMain.handle('getPreferences', () => getPreferencesFromDb());

  ipcMain.handle(
    'setPreferences',
    (_, partial: Partial<AppPreferences>) => {
      setPreferencesInDb(partial);
    }
  );

  ipcMain.handle('getSetupStatus', (_, monthKey: string) =>
    getSetupStatusFromDb(monthKey)
  );

  ipcMain.handle('seedDefaultSetup', () => seedDefaultSetupInDb());

  ipcMain.handle('getBudgetSuggestions', (_, monthKey: string) =>
    getBudgetSuggestionsFromDb(monthKey)
  );

  ipcMain.handle('updateGroup', (_, payload: UpdateGroupPayload) => {
    const name = payload.name.trim();
    if (!name) throw new Error('Group name is required.');
    const dup = db
      .prepare(
        'SELECT 1 AS ok FROM category_groups WHERE name = ? AND id != ?'
      )
      .get(name, payload.id) as { ok: number } | undefined;
    if (dup) {
      throw new Error('A group with this name already exists.');
    }
    const color = (payload.color ?? '').trim() || '#748B9D';
    db.prepare(
      'UPDATE category_groups SET name = ?, color = ? WHERE id = ?'
    ).run(name, color, payload.id);
  });

  ipcMain.handle('reorderGroup', (_, payload: ReorderEntityPayload) => {
    const rows = db
      .prepare(
        'SELECT id, sort_order FROM category_groups ORDER BY sort_order ASC, id ASC'
      )
      .all() as { id: number; sort_order: number }[];
    const i = rows.findIndex((r) => r.id === payload.id);
    if (i < 0) throw new Error('Group not found.');
    const j = payload.direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return;
    const a = rows[i];
    const b = rows[j];
    db.transaction(() => {
      db.prepare('UPDATE category_groups SET sort_order = ? WHERE id = ?').run(
        b.sort_order,
        a.id
      );
      db.prepare('UPDATE category_groups SET sort_order = ? WHERE id = ?').run(
        a.sort_order,
        b.id
      );
    })();
  });

  ipcMain.handle(
    'moveGroupCategoriesDeleteGroup',
    (_, payload: MoveGroupCategoriesPayload) => {
      const { sourceGroupId, targetGroupId } = payload;
      if (sourceGroupId === targetGroupId) {
        throw new Error('Choose a different target group.');
      }
      const run = db.transaction(() => {
        const cats = db
          .prepare(
            'SELECT id, name FROM categories WHERE group_id = ? ORDER BY sort_order ASC, id ASC'
          )
          .all(sourceGroupId) as { id: number; name: string }[];
        let max = (
          db
            .prepare(
              'SELECT COALESCE(MAX(sort_order), -1) AS n FROM categories WHERE group_id = ?'
            )
            .get(targetGroupId) as { n: number }
        ).n;
        for (const c of cats) {
          const conflict = db
            .prepare(
              'SELECT 1 AS ok FROM categories WHERE group_id = ? AND name = ?'
            )
            .get(targetGroupId, c.name) as { ok: number } | undefined;
          if (conflict) {
            throw new Error(
              `Cannot move: "${c.name}" already exists in the target group.`
            );
          }
          max += 1;
          db.prepare(
            'UPDATE categories SET group_id = ?, sort_order = ? WHERE id = ?'
          ).run(targetGroupId, max, c.id);
        }
        db.prepare('DELETE FROM category_groups WHERE id = ?').run(
          sourceGroupId
        );
      });
      run();
    }
  );

  ipcMain.handle('getGroupDeletePreview', (_, groupId: number) => {
    const cats = db
      .prepare('SELECT id FROM categories WHERE group_id = ?')
      .all(groupId) as { id: number }[];
    const categoryCount = cats.length;
    if (categoryCount === 0) {
      return { categoryCount: 0, transactionCount: 0 };
    }
    const ph = cats.map(() => '?').join(',');
    const ids = cats.map((c) => c.id);
    const txRow = db
      .prepare(
        `SELECT COUNT(*) AS n FROM transactions WHERE category_id IN (${ph})`
      )
      .get(...ids) as { n: number };
    return { categoryCount, transactionCount: txRow.n };
  });

  ipcMain.handle('updateCategory', (_, payload: UpdateCategoryPayload) => {
    const name = payload.name.trim();
    if (!name) throw new Error('Category name is required.');
    const cur = db
      .prepare('SELECT id, group_id FROM categories WHERE id = ?')
      .get(payload.id) as { id: number; group_id: number } | undefined;
    if (!cur) throw new Error('Category not found.');
    const dup = db
      .prepare(
        'SELECT 1 AS ok FROM categories WHERE group_id = ? AND name = ? AND id != ?'
      )
      .get(payload.groupId, name, payload.id) as { ok: number } | undefined;
    if (dup) {
      throw new Error('A category with this name already exists in that group.');
    }
    db.transaction(() => {
      if (cur.group_id !== payload.groupId) {
        const max = (
          db
            .prepare(
              'SELECT COALESCE(MAX(sort_order), -1) AS n FROM categories WHERE group_id = ?'
            )
            .get(payload.groupId) as { n: number }
        ).n;
        const nextOrder = max + 1;
        db.prepare(
          'UPDATE categories SET name = ?, group_id = ?, sort_order = ? WHERE id = ?'
        ).run(name, payload.groupId, nextOrder, payload.id);
      } else {
        db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(
          name,
          payload.id
        );
      }
    })();
  });

  ipcMain.handle('reorderCategory', (_, payload: ReorderEntityPayload) => {
    const row = db
      .prepare(
        'SELECT id, group_id, sort_order FROM categories WHERE id = ?'
      )
      .get(payload.id) as
        | { id: number; group_id: number; sort_order: number }
        | undefined;
    if (!row) throw new Error('Category not found.');
    const siblings = db
      .prepare(
        'SELECT id, sort_order FROM categories WHERE group_id = ? ORDER BY sort_order ASC, id ASC'
      )
      .all(row.group_id) as { id: number; sort_order: number }[];
    const i = siblings.findIndex((s) => s.id === payload.id);
    const j = payload.direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= siblings.length) return;
    const a = siblings[i];
    const b = siblings[j];
    db.transaction(() => {
      db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').run(
        b.sort_order,
        a.id
      );
      db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?').run(
        a.sort_order,
        b.id
      );
    })();
  });

  ipcMain.handle('getCategoryDeletePreview', (_, categoryId: number) => {
    const txRow = db
      .prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?')
      .get(categoryId) as { n: number };
    const budRow = db
      .prepare('SELECT COUNT(*) AS n FROM budgets WHERE category_id = ?')
      .get(categoryId) as { n: number };
    return { transactionCount: txRow.n, budgetRowCount: budRow.n };
  });

  ipcMain.handle(
    'updateIncomeSource',
    (_, payload: UpdateIncomeSourcePayload) => {
      const name = payload.name.trim();
      if (!name) throw new Error('Name is required.');
      const dup = db
        .prepare(
          'SELECT 1 AS ok FROM income_sources WHERE name = ? AND id != ?'
        )
        .get(name, payload.id) as { ok: number } | undefined;
      if (dup) {
        throw new Error('An income source with this name already exists.');
      }
      db.prepare('UPDATE income_sources SET name = ? WHERE id = ?').run(
        name,
        payload.id
      );
    }
  );

  ipcMain.handle('reorderIncomeSource', (_, payload: ReorderEntityPayload) => {
    const rows = db
      .prepare(
        'SELECT id, sort_order FROM income_sources ORDER BY sort_order ASC, id ASC'
      )
      .all() as { id: number; sort_order: number }[];
    const i = rows.findIndex((r) => r.id === payload.id);
    if (i < 0) throw new Error('Income source not found.');
    const j = payload.direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) return;
    const a = rows[i];
    const b = rows[j];
    db.transaction(() => {
      db.prepare('UPDATE income_sources SET sort_order = ? WHERE id = ?').run(
        b.sort_order,
        a.id
      );
      db.prepare('UPDATE income_sources SET sort_order = ? WHERE id = ?').run(
        a.sort_order,
        b.id
      );
    })();
  });

  ipcMain.handle('getIncomeSourceDeletePreview', (_, sourceId: number) => {
    const a = db
      .prepare(
        'SELECT COUNT(*) AS n FROM income_actuals WHERE source_id = ?'
      )
      .get(sourceId) as { n: number };
    const b = db
      .prepare(
        'SELECT COUNT(*) AS n FROM income_budgets WHERE source_id = ?'
      )
      .get(sourceId) as { n: number };
    return { actualCount: a.n, budgetRowCount: b.n };
  });

  ipcMain.handle('deleteIncomeSource', (_, sourceId: number) => {
    db.transaction(() => {
      db.prepare(
        `DELETE FROM category_mappings WHERE target_type = 'income_source' AND target_id = ?`
      ).run(sourceId);
      db.prepare('DELETE FROM income_sources WHERE id = ?').run(sourceId);
    })();
  });

  ipcMain.handle('deleteCategoryMapping', (_, mappingId: number) => {
    db.prepare('DELETE FROM category_mappings WHERE id = ?').run(mappingId);
  });

  ipcMain.handle('exportDatabaseBackup', async () => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No window.');
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      /** */
    }
    const defaultName = `spend-backup-${new Date().toISOString().slice(0, 10)}.db`;
    const r = await dialog.showSaveDialog(win, {
      title: 'Export database backup',
      defaultPath: defaultName,
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.copyFileSync(getDbPath(), r.filePath);
    return r.filePath;
  });

  ipcMain.handle('importDatabaseBackup', async () => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No window.');
    const r = await dialog.showOpenDialog(win, {
      title: 'Import database backup',
      properties: ['openFile'],
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    });
    if (r.canceled || !r.filePaths[0]) return;
    replaceDatabaseWithBackupFile(r.filePaths[0]);
    reloadAllRendererWindows();
  });

  ipcMain.handle('resetDatabase', (_, mode: ResetDatabaseMode) => {
    db.transaction(() => {
      db.prepare('DELETE FROM transactions').run();
      db.prepare('DELETE FROM budgets').run();
      db.prepare('DELETE FROM income_budgets').run();
      db.prepare('DELETE FROM income_actuals').run();
      db.prepare('DELETE FROM category_mappings').run();
      if (mode === 'full') {
        db.prepare('DELETE FROM categories').run();
        db.prepare('DELETE FROM category_groups').run();
        db.prepare('DELETE FROM income_sources').run();
      }
    })();
    reloadAllRendererWindows();
  });

  ipcMain.handle('getBudget', (_, monthKey: string) =>
    getBudgetData(monthKey)
  );

  ipcMain.handle(
    'setBudgetAmount',
    (_, categoryId: number, monthKey: string, amountCents: number) => {
      db.prepare(
        `INSERT INTO budgets (category_id, month_key, amount_cents, frequency, annual_amount_cents)
       VALUES (?, ?, ?, 'monthly', NULL)
       ON CONFLICT(category_id, month_key) DO UPDATE SET
         amount_cents = excluded.amount_cents,
         frequency = 'monthly',
         annual_amount_cents = NULL`
      ).run(categoryId, monthKey, amountCents);
    }
  );

  ipcMain.handle(
    'setBudgetDetails',
    (
      _,
      categoryId: number,
      monthKey: string,
      details: SetBudgetDetailsInput,
      applyToFullYear?: boolean
    ) => {
      const freq = details.frequency;
      if (!BUDGET_FREQUENCIES.has(freq)) {
        throw new Error('Invalid budget frequency.');
      }
      if (freq === 'monthly') {
        const amt = details.amountCents;
        if (amt == null || !Number.isFinite(amt)) {
          throw new Error('Monthly budget amount is required.');
        }
        db.prepare(
          `INSERT INTO budgets (category_id, month_key, amount_cents, frequency, annual_amount_cents)
           VALUES (?, ?, ?, 'monthly', NULL)
           ON CONFLICT(category_id, month_key) DO UPDATE SET
             amount_cents = excluded.amount_cents,
             frequency = 'monthly',
             annual_amount_cents = NULL`
        ).run(categoryId, monthKey, Math.round(amt));
        return;
      }
      const annual = details.annualAmountCents;
      if (annual == null || !Number.isFinite(annual)) {
        throw new Error('Annual amount is required for this frequency.');
      }
      const annualInt = Math.round(annual);
      const monthlySetAside = Math.round(annualInt / 12);
      const upsertSinking = db.prepare(
        `INSERT INTO budgets (category_id, month_key, amount_cents, frequency, annual_amount_cents)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(category_id, month_key) DO UPDATE SET
           amount_cents = excluded.amount_cents,
           frequency = excluded.frequency,
           annual_amount_cents = excluded.annual_amount_cents`
      );
      if (applyToFullYear === true) {
        const keys = monthKeysForCalendarYear(monthKey);
        const runAll = db.transaction(() => {
          for (const mk of keys) {
            upsertSinking.run(categoryId, mk, monthlySetAside, freq, annualInt);
          }
        });
        runAll();
      } else {
        upsertSinking.run(
          categoryId,
          monthKey,
          monthlySetAside,
          freq,
          annualInt
        );
      }
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

  ipcMain.handle('getTrends', (_, range: TrendRange) => getTrendsData(range));

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
      title: 'Choose CSV file',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return r.filePaths[0];
  });

  ipcMain.handle('peekCSV', (_, filePath: string, headerRowIndex?: number) => {
    return peekCSV(filePath, headerRowIndex ?? 0);
  });

  ipcMain.handle('getLastImportProfile', () => {
    const row = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(SETTINGS_KEY_LAST_IMPORT_PROFILE) as { value: string } | undefined;
    const v = row?.value?.trim();
    if (v && getCSVProfile(v)) {
      return v;
    }
    return DEFAULT_IMPORT_PROFILE_ID;
  });

  ipcMain.handle('setLastImportProfile', (_, profileId: string) => {
    const id =
      typeof profileId === 'string' && profileId.trim()
        ? profileId.trim()
        : DEFAULT_IMPORT_PROFILE_ID;
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      SETTINGS_KEY_LAST_IMPORT_PROFILE,
      id
    );
  });

  ipcMain.handle(
    'parseCSV',
    (_, filePath: string, options?: ParseCSVOptions) => {
      const profileId = options?.profileId ?? DEFAULT_IMPORT_PROFILE_ID;
      if (profileId === DEFAULT_IMPORT_PROFILE_ID) {
        return parseMonarchCSV(filePath);
      }
      const mapping = resolveImportMapping(
        profileId,
        options?.genericMapping ?? null
      );
      if (!mapping) {
        throw new Error(
          'Column mapping is required for generic CSV imports.'
        );
      }
      return parseProfileCSV(filePath, mapping, {
        mappingSource: profileId,
        profileName: profileNameForId(profileId),
        loadMappingNameLookups: () => loadMappingNameLookups(db),
        loadMappingRows: (source: string) =>
          db
            .prepare(
              `SELECT id, external_name, target_type, target_id
               FROM category_mappings WHERE source = ?`
            )
            .all(source) as MappingDbRow[],
      });
    }
  );

  ipcMain.handle('getCategoryMappings', () => {
    const { catNames, incomeNames } = loadMappingNameLookups(db);
    const mappingRows = db
      .prepare(
        `SELECT id, external_name, target_type, target_id
         FROM category_mappings WHERE source = ? ORDER BY external_name COLLATE NOCASE`
      )
      .all(MAPPING_SOURCE) as MappingDbRow[];
    return mappingRows.map((row) =>
      toCategoryMapping(row, MAPPING_SOURCE, catNames, incomeNames)
    );
  });

  ipcMain.handle(
    'saveCategoryMapping',
    (_, input: SaveCategoryMappingInput) => {
      const external_name = input.externalName.trim();
      const source = input.source?.trim() || MAPPING_SOURCE;
      db.prepare(
        `INSERT INTO category_mappings (source, external_name, target_type, target_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(source, external_name) DO UPDATE SET
           target_type = excluded.target_type,
           target_id = excluded.target_id`
      ).run(
        source,
        external_name,
        input.targetType,
        input.targetId
      );
    }
  );

  ipcMain.handle('analyzeDuplicates', (_, rows: DedupeRow[]) =>
    analyzeImportCandidates(db, Array.isArray(rows) ? rows : [])
  );

  ipcMain.handle('findDuplicateRows', () => findDuplicatePairs(db));

  ipcMain.handle('deleteLedgerRows', (_, input: DeleteLedgerRowsInput) => {
    const txIds = (input?.transactionIds ?? []).filter((id) =>
      Number.isInteger(id)
    );
    const incIds = (input?.incomeIds ?? []).filter((id) => Number.isInteger(id));
    const delTx = db.prepare('DELETE FROM transactions WHERE id = ?');
    const delInc = db.prepare('DELETE FROM income_actuals WHERE id = ?');
    const run = db.transaction(() => {
      let deleted = 0;
      for (const id of txIds) deleted += delTx.run(id).changes;
      for (const id of incIds) deleted += delInc.run(id).changes;
      return deleted;
    });
    return { deleted: run() };
  });

  ipcMain.handle('getMonthSpendingTotal', (_, monthKey: string) => {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS t
         FROM transactions WHERE substr(date, 1, 7) = ?`
      )
      .get(monthKey) as { t: number };
    return Number(row?.t ?? 0);
  });

  ipcMain.handle('getMerchantInsights', (_, merchantName: string) =>
    getMerchantInsightsData(typeof merchantName === 'string' ? merchantName : '')
  );

  ipcMain.handle('getMonthNote', (_, monthKey: string) =>
    getMonthNoteRow(typeof monthKey === 'string' ? monthKey : '')
  );

  ipcMain.handle('setMonthNote', (_, monthKey: string, note: string) => {
    setMonthNoteRow(
      typeof monthKey === 'string' ? monthKey : '',
      typeof note === 'string' ? note : ''
    );
  });

  ipcMain.handle('commitImport', (_, rows: CommitImportRow[]) =>
    runCommitImport(db, Array.isArray(rows) ? rows : [])
  );

  ipcMain.handle('isMonarchSyncEnabled', () => isMonarchSyncEnabled());

  ipcMain.handle('syncFromMonarch', async () => {
    if (!isMonarchSyncEnabled()) {
      return {
        status: 'error',
        message: 'Monarch sync is not configured.',
      } as const;
    }
    return syncFromMonarch({ db });
  });

  ipcMain.handle('commitMappedMonarchRows', (_, rows: ParsedRow[]) => {
    if (!isMonarchSyncEnabled()) {
      throw new Error('Monarch sync is not configured.');
    }
    return commitMappedMonarchRows(
      { db },
      Array.isArray(rows) ? rows : []
    );
  });
}

/**
 * Unpacked / dev: `dist-electron` → `build/icon.icns`.
 * Omitted in packaged app (bundle icon from electron-builder).
 * Uses nativeImage so a missing/corrupt file never crashes startup.
 */
function resolveLocalAppIcon(): Electron.NativeImage | undefined {
  const icns = path.join(__dirname, '..', 'build', 'icon.icns');
  if (!fs.existsSync(icns)) return undefined;
  const img = nativeImage.createFromPath(icns);
  return img.isEmpty() ? undefined : img;
}

function createWindow() {
  const icon = resolveLocalAppIcon();
  if (process.platform === 'darwin' && app.dock && icon) {
    try {
      app.dock.setIcon(icon);
    } catch {
      /* invalid icon should not block launch */
    }
  }
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#F6F5F0',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  /** Only the explicit flag loads Vite; NODE_ENV is unreliable when running `electron .` after a build. */
  const useViteDevServer = process.env.ELECTRON_IS_DEV === '1';

  win.webContents.on('preload-error', (_event, preloadPath, err) => {
    console.error('[Spend] preload-error', preloadPath, err);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (!useViteDevServer) {
    win.webContents.on('will-navigate', (event, url) => {
      if (
        url.startsWith('http:') ||
        url.startsWith('https:') ||
        url.startsWith('mailto:')
      ) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    });
  }

  if (useViteDevServer) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  appendBootLog('app.whenReady');
  try {
    initDb();
    appendBootLog('initDb ok');
    registerIpcHandlers();
    createWindow();
    appendBootLog('createWindow ok');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Spend] startup failed:', err);
    appendBootLog(`startup catch: ${msg}`);
    if (err instanceof Error && err.stack) console.error(err.stack);
    try {
      dialog.showErrorBox(
        'Spend could not start',
        `${msg}\n\nLog: ${path.join(process.env.TMPDIR || '/tmp', 'spend-electron-boot.log')}\n\nOr run: Spend.app/Contents/MacOS/Spend in Terminal.`
      );
    } catch {
      /* */
    }
    app.quit();
    process.exit(1);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  flushAndCloseDb();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.info(`[Spend] ${sig} received — flushing database to disk`);
    flushAndCloseDb();
    /** Hard exit: avoid a half-shut app still issuing IPC against a closed DB. */
    app.exit(0);
  });
}

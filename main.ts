import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Database from 'better-sqlite3';
import type {
  AddTransactionPayload,
  BudgetPayload,
  CreateCategoryPayload,
  CreateGroupPayload,
  CreateIncomeSourcePayload,
  TransactionFilters,
} from './ipc-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default userData in dev is ~/Library/Application Support/Electron; align with spend-app.
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

function initDb() {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
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
    actual_cents: 0,
  }));

  return { groups: resultGroups, income };
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

  ipcMain.handle('getBudget', (_, monthKey: string) => getBudgetData(monthKey));

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

  ipcMain.handle('createIncomeSource', (_, payload: CreateIncomeSourcePayload) => {
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
  });

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
    const monthKey = filters?.monthKey;
    const categoryId = filters?.categoryId;
    let sql = `SELECT id, date, description, amount_cents, category_id
               FROM transactions WHERE 1=1`;
    const params: (string | number)[] = [];
    if (monthKey) {
      sql += ' AND substr(date, 1, 7) = ?';
      params.push(monthKey);
    }
    if (categoryId != null) {
      sql += ' AND category_id = ?';
      params.push(categoryId);
    }
    sql += ' ORDER BY date DESC, id DESC';
    return db.prepare(sql).all(...params);
  });

  ipcMain.handle('addTransaction', (_, payload: AddTransactionPayload) => {
    const { category_id, date, description, amount_cents } = payload;
    const r = db
      .prepare(
        `INSERT INTO transactions (category_id, date, description, amount_cents)
         VALUES (?, ?, ?, ?)`
      )
      .run(category_id, date, description ?? '', amount_cents);
    return { id: Number(r.lastInsertRowid) };
  });

  ipcMain.handle('importCSV', () => ({ imported: 0, skipped: 0 }));
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

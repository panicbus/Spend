-- Spend. Database Schema
-- All monetary values stored as integers (cents)

CREATE TABLE IF NOT EXISTS category_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#888888',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES category_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(group_id, name)
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,  -- format: "YYYY-MM"
  amount_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE(category_id, month_key)
);

CREATE TABLE IF NOT EXISTS income_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS income_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES income_sources(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE(source_id, month_key)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  date TEXT NOT NULL,        -- format: "YYYY-MM-DD"
  description TEXT NOT NULL DEFAULT '',
  merchant TEXT,
  account TEXT,
  original_statement TEXT,
  notes TEXT,
  amount_cents INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'csv'
  import_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS category_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  UNIQUE(source, external_name)
);

CREATE INDEX IF NOT EXISTS idx_category_mappings_lookup
  ON category_mappings(source, external_name);

CREATE TABLE IF NOT EXISTS income_actuals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES income_sources(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  import_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_income_actuals_date ON income_actuals(date);
CREATE INDEX IF NOT EXISTS idx_income_actuals_hash ON income_actuals(import_hash);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
-- idx_transactions_import_hash is created in main.ts after ALTER adds import_hash (existing DBs).
CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month_key);
CREATE INDEX IF NOT EXISTS idx_income_budgets_month ON income_budgets(month_key);

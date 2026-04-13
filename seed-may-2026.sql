-- Spend. — May 2026 Budget Seed
-- Run from project root after quitting the Electron app:
--   sqlite3 "$HOME/Library/Application Support/spend-app/spend.db" < seed-may-2026.sql
--
-- This script does three things:
--   1. Cleans up category schema (rename + delete unused line items)
--   2. Sets May 2026 budget amounts for all expense categories
--   3. Sets May 2026 income budgets

BEGIN TRANSACTION;

-- ============================================================
-- 1. SCHEMA CLEANUP
-- ============================================================

-- Rename EBMUD / Water → Utilities (catch-all for electric and basic utils)
UPDATE categories
SET name = 'Utilities'
WHERE name = 'EBMUD / Water';

-- Remove unused expense line items entirely
DELETE FROM categories WHERE name = 'Therapy';
DELETE FROM categories WHERE name = 'Cleaners';
DELETE FROM categories WHERE name = 'Pets';
DELETE FROM categories WHERE name = 'Bank Fees';
DELETE FROM categories WHERE name = 'Hotels';
DELETE FROM categories WHERE name = 'Accounting Services';
DELETE FROM categories WHERE name = 'Office Rent';
DELETE FROM categories WHERE name = 'Savings Deposit';

-- Optional: drop the now-empty Business & Misc group entirely
-- (uncomment if you want it gone — it has no remaining categories)
DELETE FROM category_groups WHERE name = 'Business & Misc'
  AND NOT EXISTS (SELECT 1 FROM categories WHERE group_id = category_groups.id);

-- ============================================================
-- 2. EXPENSE BUDGETS — May 2026
-- ============================================================
-- Pattern: insert (or replace) one row per category for month_key '2026-05'
-- Amounts are in cents (multiply dollars by 100)

-- Housing
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 230000 FROM categories WHERE name = 'Rent';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 9300 FROM categories WHERE name = 'Home Improvement / Housewares';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 10000 FROM categories WHERE name = 'Furniture';

-- Bills & Utilities
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 5500 FROM categories WHERE name = 'Internet';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 7000 FROM categories WHERE name = 'Phone';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 10000 FROM categories WHERE name = 'Utilities';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 4000 FROM categories WHERE name = 'Streaming & Subscriptions';

-- Food & Dining
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 65000 FROM categories WHERE name = 'Groceries';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 15200 FROM categories WHERE name = 'Restaurants & Bars';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 3000 FROM categories WHERE name = 'Coffee Shops';

-- Auto & Transport
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 44700 FROM categories WHERE name = 'Auto Payment';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 5000 FROM categories WHERE name = 'Gas';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 3000 FROM categories WHERE name = 'E-Charging';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 23300 FROM categories WHERE name = 'Auto Insurance';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 2000 FROM categories WHERE name = 'Auto Maintenance';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 5000 FROM categories WHERE name = 'Parking, Tolls, Wash, Tix';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 0 FROM categories WHERE name = 'Auto Registration / License';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 3700 FROM categories WHERE name = 'Public Transit / Clipper / Uber';

-- Health & Wellness
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 9600 FROM categories WHERE name = 'Medical (Doctor, Pharmacy, Dentist)';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 4700 FROM categories WHERE name = 'Hair / Spa / Retreat';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 2200 FROM categories WHERE name = 'Fitness (Running, Biking)';

-- Children
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 20000 FROM categories WHERE name = 'Child Support';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 600 FROM categories WHERE name = 'Ory Allowance';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 43000 FROM categories WHERE name = 'Ory Expenses';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 2200 FROM categories WHERE name = 'Ory Sports';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 5000 FROM categories WHERE name = 'Ory Clothes';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 1800 FROM categories WHERE name = 'Ory Haircut';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 10200 FROM categories WHERE name = 'Ory Doctor / Dentist / Ortho';

-- Shopping
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 14700 FROM categories WHERE name = 'Clothing (Nico)';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 11800 FROM categories WHERE name = 'Shopping & Sundries';

-- Travel & Lifestyle
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 0 FROM categories WHERE name = 'Vacation & Travel';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 22900 FROM categories WHERE name = 'Entertainment & Concerts';

-- Gifts & Donations
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 2600 FROM categories WHERE name = 'Charitable Gifts';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 17700 FROM categories WHERE name = 'Gifts (Birthdays, Xmas)';

-- Savings & Investments
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 4000 FROM categories WHERE name = 'Ory College Fund';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 0 FROM categories WHERE name = 'Stock Investing (Robinhood)';
INSERT OR REPLACE INTO budgets (category_id, month_key, amount_cents)
  SELECT id, '2026-05', 0 FROM categories WHERE name = 'Acorns';

-- ============================================================
-- 3. INCOME BUDGETS — May 2026
-- ============================================================

INSERT OR REPLACE INTO income_budgets (source_id, month_key, amount_cents)
  SELECT id, '2026-05', 602800 FROM income_sources WHERE name = 'Salary';
INSERT OR REPLACE INTO income_budgets (source_id, month_key, amount_cents)
  SELECT id, '2026-05', 5000 FROM income_sources WHERE name = 'Cash Rewards';
INSERT OR REPLACE INTO income_budgets (source_id, month_key, amount_cents)
  SELECT id, '2026-05', 0 FROM income_sources WHERE name = 'Tax Refund';
INSERT OR REPLACE INTO income_budgets (source_id, month_key, amount_cents)
  SELECT id, '2026-05', 2500 FROM income_sources WHERE name = 'Publishing Income';
INSERT OR REPLACE INTO income_budgets (source_id, month_key, amount_cents)
  SELECT id, '2026-05', 0 FROM income_sources WHERE name = 'Other Income';

COMMIT;

-- ============================================================
-- 4. VERIFICATION QUERIES (run after the seed)
-- ============================================================
-- Total budgeted expenses for May:
--   sqlite3 "$HOME/Library/Application Support/spend-app/spend.db" \
--     "SELECT printf('$%.2f', SUM(amount_cents)/100.0) FROM budgets WHERE month_key='2026-05';"
--
-- Total budgeted income for May:
--   sqlite3 "$HOME/Library/Application Support/spend-app/spend.db" \
--     "SELECT printf('$%.2f', SUM(amount_cents)/100.0) FROM income_budgets WHERE month_key='2026-05';"
--
-- Net (income - expenses):
--   sqlite3 "$HOME/Library/Application Support/spend-app/spend.db" \
--     "SELECT printf('$%.2f',
--       (SELECT COALESCE(SUM(amount_cents),0) FROM income_budgets WHERE month_key='2026-05') -
--       (SELECT COALESCE(SUM(amount_cents),0) FROM budgets WHERE month_key='2026-05')
--     ) / 100.0;"

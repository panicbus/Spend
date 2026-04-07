-- Spend. Seed Data
-- Run this once after first launch to populate categories and income sources.
-- Usage from project root (quit the app first if you see "database is locked"):
--   sqlite3 "$HOME/Library/Application Support/spend-app/spend.db" < seed.sql
-- Path matches Electron app name in package.json (userData = spend-app).

-- ============================================================
-- CATEGORY GROUPS
-- ============================================================
INSERT OR IGNORE INTO category_groups (name, color, sort_order) VALUES
  ('Housing',              '#3A7BD5', 1),
  ('Bills & Utilities',    '#6B5CE7', 2),
  ('Food & Dining',        '#2D9F75', 3),
  ('Auto & Transport',     '#E5953E', 4),
  ('Health & Wellness',    '#D94F4F', 5),
  ('Children',             '#4FBCD9', 6),
  ('Shopping',             '#E76BAC', 7),
  ('Travel & Lifestyle',   '#9F6B2D', 8),
  ('Gifts & Donations',    '#B8860B', 9),
  ('Business & Misc',      '#7A7A7A', 10),
  ('Savings & Investments','#1A7A56', 11);

-- ============================================================
-- CATEGORIES (line items within each group)
-- ============================================================

-- Housing
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Housing'), 'Rent', 1),
  ((SELECT id FROM category_groups WHERE name='Housing'), 'Home Improvement / Housewares', 2),
  ((SELECT id FROM category_groups WHERE name='Housing'), 'Furniture', 3);

-- Bills & Utilities (the spreadsheet utilities bucket: internet, spotify, EBMUD, cleaners, phone, duolingo, SiriusXM)
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Bills & Utilities'), 'Internet', 1),
  ((SELECT id FROM category_groups WHERE name='Bills & Utilities'), 'Phone', 2),
  ((SELECT id FROM category_groups WHERE name='Bills & Utilities'), 'EBMUD / Water', 3),
  ((SELECT id FROM category_groups WHERE name='Bills & Utilities'), 'Streaming & Subscriptions', 4),
  ((SELECT id FROM category_groups WHERE name='Bills & Utilities'), 'Cleaners', 5),
  ((SELECT id FROM category_groups WHERE name='Bills & Utilities'), 'Pets', 6),
  ((SELECT id FROM category_groups WHERE name='Bills & Utilities'), 'Bank Fees', 7);

-- Food & Dining
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Food & Dining'), 'Groceries', 1),
  ((SELECT id FROM category_groups WHERE name='Food & Dining'), 'Restaurants & Bars', 2),
  ((SELECT id FROM category_groups WHERE name='Food & Dining'), 'Coffee Shops', 3);

-- Auto & Transport
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Auto & Transport'), 'Auto Payment', 1),
  ((SELECT id FROM category_groups WHERE name='Auto & Transport'), 'Gas', 2),
  ((SELECT id FROM category_groups WHERE name='Auto & Transport'), 'E-Charging', 3),
  ((SELECT id FROM category_groups WHERE name='Auto & Transport'), 'Auto Insurance', 4),
  ((SELECT id FROM category_groups WHERE name='Auto & Transport'), 'Auto Maintenance', 5),
  ((SELECT id FROM category_groups WHERE name='Auto & Transport'), 'Parking, Tolls, Wash, Tix', 6),
  ((SELECT id FROM category_groups WHERE name='Auto & Transport'), 'Auto Registration / License', 7),
  ((SELECT id FROM category_groups WHERE name='Auto & Transport'), 'Public Transit / Clipper / Uber', 8);

-- Health & Wellness
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Health & Wellness'), 'Medical (Doctor, Pharmacy, Dentist)', 1),
  ((SELECT id FROM category_groups WHERE name='Health & Wellness'), 'Therapy', 2),
  ((SELECT id FROM category_groups WHERE name='Health & Wellness'), 'Hair / Spa / Retreat', 3),
  ((SELECT id FROM category_groups WHERE name='Health & Wellness'), 'Fitness (Running, Biking)', 4);

-- Children (Ory)
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Children'), 'Child Support', 1),
  ((SELECT id FROM category_groups WHERE name='Children'), 'Ory Allowance', 2),
  ((SELECT id FROM category_groups WHERE name='Children'), 'Ory Expenses', 3),
  ((SELECT id FROM category_groups WHERE name='Children'), 'Ory Sports', 4),
  ((SELECT id FROM category_groups WHERE name='Children'), 'Ory Clothes', 5),
  ((SELECT id FROM category_groups WHERE name='Children'), 'Ory Haircut', 6),
  ((SELECT id FROM category_groups WHERE name='Children'), 'Ory Doctor / Dentist / Ortho', 7);

-- Shopping
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Shopping'), 'Clothing (Nico)', 1),
  ((SELECT id FROM category_groups WHERE name='Shopping'), 'Shopping & Sundries', 2);

-- Travel & Lifestyle
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Travel & Lifestyle'), 'Vacation & Travel', 1),
  ((SELECT id FROM category_groups WHERE name='Travel & Lifestyle'), 'Hotels', 2),
  ((SELECT id FROM category_groups WHERE name='Travel & Lifestyle'), 'Entertainment & Concerts', 3);

-- Gifts & Donations
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Gifts & Donations'), 'Charitable Gifts', 1),
  ((SELECT id FROM category_groups WHERE name='Gifts & Donations'), 'Gifts (Birthdays, Xmas)', 2);

-- Business & Misc
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Business & Misc'), 'Accounting Services', 1),
  ((SELECT id FROM category_groups WHERE name='Business & Misc'), 'Office Rent', 2);

-- Savings & Investments
INSERT OR IGNORE INTO categories (group_id, name, sort_order) VALUES
  ((SELECT id FROM category_groups WHERE name='Savings & Investments'), 'Savings Deposit', 1),
  ((SELECT id FROM category_groups WHERE name='Savings & Investments'), 'Stock Investing (Robinhood)', 2),
  ((SELECT id FROM category_groups WHERE name='Savings & Investments'), 'Acorns', 3),
  ((SELECT id FROM category_groups WHERE name='Savings & Investments'), 'Ory College Fund', 4);

-- ============================================================
-- INCOME SOURCES
-- ============================================================
INSERT OR IGNORE INTO income_sources (name, sort_order) VALUES
  ('Salary',            1),
  ('Cash Rewards',      2),
  ('Tax Refund',        3),
  ('Publishing Income', 4),
  ('Other Income',      5);

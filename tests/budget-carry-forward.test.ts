import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// The app's own driver, so parameter-binding rules match production.
// better-sqlite3 is built for Electron's ABI: run under `npm run test:db`.
import Database from 'better-sqlite3';
import {
  fillMonthFromPrior,
  setCategoryBudgetFrom,
  setIncomeBudgetFrom,
} from '../budgetCarryForward.ts';

const schema = fs.readFileSync(
  new URL('../database/schema.sql', import.meta.url),
  'utf8'
);

let db: Database.Database;

function budget(categoryId: number, monthKey: string) {
  return db
    .prepare(
      'SELECT amount_cents, frequency FROM budgets WHERE category_id = ? AND month_key = ?'
    )
    .get(categoryId, monthKey) as
    { amount_cents: number; frequency: string } | undefined;
}

function incomeBudget(sourceId: number, monthKey: string) {
  const r = db
    .prepare(
      'SELECT amount_cents FROM income_budgets WHERE source_id = ? AND month_key = ?'
    )
    .get(sourceId, monthKey) as { amount_cents: number } | undefined;
  return r?.amount_cents;
}

function seedBudget(
  categoryId: number,
  monthKey: string,
  cents: number,
  frequency = 'monthly'
) {
  db.prepare(
    `INSERT INTO budgets (category_id, month_key, amount_cents, frequency, annual_amount_cents)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    categoryId,
    monthKey,
    cents,
    frequency,
    frequency === 'monthly' ? null : cents * 12
  );
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(schema);
  db.exec(`
    INSERT INTO category_groups (id, name, color) VALUES (1, 'Housing', '#000');
    INSERT INTO categories (id, group_id, name) VALUES
      (1, 1, 'Rent'), (2, 1, 'Furniture'), (3, 1, 'Gifts');
    INSERT INTO income_sources (id, name) VALUES (1, 'Salary');
  `);
});

describe('fillMonthFromPrior', () => {
  it('fills a month that already holds pre-written sinking rows', () => {
    // September is fully budgeted; October only has a sinking row written ahead.
    seedBudget(1, '2026-09', 230000);
    seedBudget(2, '2026-09', 5000);
    seedBudget(3, '2026-09', 3333, 'yearly');
    seedBudget(3, '2026-10', 3333, 'yearly');
    db.prepare(
      'INSERT INTO income_budgets (source_id, month_key, amount_cents) VALUES (1, ?, ?)'
    ).run('2026-09', 600000);

    fillMonthFromPrior(db, '2026-10');

    assert.equal(budget(1, '2026-10')?.amount_cents, 230000);
    assert.equal(budget(2, '2026-10')?.amount_cents, 5000);
    assert.deepEqual(budget(3, '2026-10'), {
      amount_cents: 3333,
      frequency: 'yearly',
    });
    assert.equal(incomeBudget(1, '2026-10'), 600000);
  });

  it('takes each category from its own latest earlier month', () => {
    seedBudget(1, '2026-07', 200000);
    seedBudget(1, '2026-08', 230000);
    seedBudget(2, '2026-06', 4000);

    fillMonthFromPrior(db, '2026-10');

    assert.equal(budget(1, '2026-10')?.amount_cents, 230000);
    assert.equal(budget(2, '2026-10')?.amount_cents, 4000);
  });

  it('never overwrites a row the month already has, nor fills backwards', () => {
    seedBudget(1, '2026-09', 230000);
    seedBudget(1, '2026-10', 250000);

    fillMonthFromPrior(db, '2026-10');
    fillMonthFromPrior(db, '2026-08');

    assert.equal(budget(1, '2026-10')?.amount_cents, 250000);
    assert.equal(budget(1, '2026-08'), undefined);
  });
});

describe('setCategoryBudgetFrom', () => {
  it('updates this month and every later month on record, leaving earlier ones', () => {
    seedBudget(1, '2026-09', 230000);
    seedBudget(1, '2026-10', 230000);
    seedBudget(1, '2026-12', 230000);

    setCategoryBudgetFrom(db, 1, '2026-10', {
      amountCents: 240000,
      frequency: 'monthly',
      annualAmountCents: null,
    });

    assert.equal(budget(1, '2026-09')?.amount_cents, 230000);
    assert.equal(budget(1, '2026-10')?.amount_cents, 240000);
    assert.equal(budget(1, '2026-12')?.amount_cents, 240000);

    // A month not yet on record picks the new value up when first opened.
    fillMonthFromPrior(db, '2026-11');
    assert.equal(budget(1, '2026-11')?.amount_cents, 240000);
  });

  it('switches later sinking rows back to monthly', () => {
    seedBudget(3, '2026-11', 3333, 'yearly');

    setCategoryBudgetFrom(db, 3, '2026-10', {
      amountCents: 5000,
      frequency: 'monthly',
      annualAmountCents: null,
    });

    assert.deepEqual(budget(3, '2026-11'), {
      amount_cents: 5000,
      frequency: 'monthly',
    });
  });
});

describe('setIncomeBudgetFrom', () => {
  it('updates this month and every later month on record', () => {
    const ins = db.prepare(
      'INSERT INTO income_budgets (source_id, month_key, amount_cents) VALUES (1, ?, ?)'
    );
    ins.run('2026-09', 600000);
    ins.run('2026-11', 600000);

    setIncomeBudgetFrom(db, 1, '2026-10', 650000);

    assert.equal(incomeBudget(1, '2026-09'), 600000);
    assert.equal(incomeBudget(1, '2026-10'), 650000);
    assert.equal(incomeBudget(1, '2026-11'), 650000);
  });
});

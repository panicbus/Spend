/**
 * Budgets carry forward month to month, per category (and per income source).
 *
 * A month with no row for a category inherits that category's most recent
 * earlier row. Setting a budget in one month also rewrites every later month
 * that already has a row, so a change made today holds for all months ahead.
 *
 * The fill is per row, not per month: sinking-fund saves write rows into
 * future months ahead of time, and a month holding only those must still pick
 * up every other category from the month before.
 *
 * Callers own the transaction; these only issue statements.
 */

/** The slice of better-sqlite3 (or node:sqlite) these helpers use. */
export interface SqlDb {
  prepare(sql: string): { run(...params: unknown[]): unknown };
}

export interface CategoryBudgetValue {
  amountCents: number;
  frequency: string;
  annualAmountCents: number | null;
}

/** Give `monthKey` every category and income budget it lacks, from the latest earlier month that has one. */
export function fillMonthFromPrior(db: SqlDb, monthKey: string): void {
  db.prepare(
    `INSERT INTO budgets (category_id, month_key, amount_cents, frequency, annual_amount_cents)
     SELECT b.category_id, ?, b.amount_cents, b.frequency, b.annual_amount_cents
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     WHERE b.month_key = (
         SELECT MAX(p.month_key) FROM budgets p
         WHERE p.category_id = b.category_id AND p.month_key < ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM budgets x
         WHERE x.category_id = b.category_id AND x.month_key = ?
       )`
  ).run(monthKey, monthKey, monthKey);

  db.prepare(
    `INSERT INTO income_budgets (source_id, month_key, amount_cents)
     SELECT b.source_id, ?, b.amount_cents
     FROM income_budgets b
     JOIN income_sources s ON s.id = b.source_id
     WHERE b.month_key = (
         SELECT MAX(p.month_key) FROM income_budgets p
         WHERE p.source_id = b.source_id AND p.month_key < ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM income_budgets x
         WHERE x.source_id = b.source_id AND x.month_key = ?
       )`
  ).run(monthKey, monthKey, monthKey);
}

/** Set a category's budget for `monthKey` alone. */
export function upsertCategoryBudget(
  db: SqlDb,
  categoryId: number,
  monthKey: string,
  value: CategoryBudgetValue
): void {
  db.prepare(
    `INSERT INTO budgets (category_id, month_key, amount_cents, frequency, annual_amount_cents)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(category_id, month_key) DO UPDATE SET
       amount_cents = excluded.amount_cents,
       frequency = excluded.frequency,
       annual_amount_cents = excluded.annual_amount_cents`
  ).run(
    categoryId,
    monthKey,
    value.amountCents,
    value.frequency,
    value.annualAmountCents
  );
}

/** Set a category's budget for `monthKey` and every later month already on record. */
export function setCategoryBudgetFrom(
  db: SqlDb,
  categoryId: number,
  monthKey: string,
  value: CategoryBudgetValue
): void {
  const { amountCents, frequency, annualAmountCents } = value;
  upsertCategoryBudget(db, categoryId, monthKey, value);
  db.prepare(
    `UPDATE budgets SET amount_cents = ?, frequency = ?, annual_amount_cents = ?
     WHERE category_id = ? AND month_key > ?`
  ).run(amountCents, frequency, annualAmountCents, categoryId, monthKey);
}

/** Set an income source's expected amount for `monthKey` and every later month already on record. */
export function setIncomeBudgetFrom(
  db: SqlDb,
  sourceId: number,
  monthKey: string,
  amountCents: number
): void {
  db.prepare(
    `INSERT INTO income_budgets (source_id, month_key, amount_cents)
     VALUES (?, ?, ?)
     ON CONFLICT(source_id, month_key) DO UPDATE SET
       amount_cents = excluded.amount_cents`
  ).run(sourceId, monthKey, amountCents);
  db.prepare(
    `UPDATE income_budgets SET amount_cents = ?
     WHERE source_id = ? AND month_key > ?`
  ).run(amountCents, sourceId, monthKey);
}

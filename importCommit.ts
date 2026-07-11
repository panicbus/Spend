import type Database from 'better-sqlite3';
import type { CommitImportResult, CommitImportRow } from './src/types/import.js';

export function runCommitImport(
  db: Database.Database,
  rows: CommitImportRow[]
): CommitImportResult {
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  let staleTargets = 0;
  let addedExpenseCents = 0;
  let addedIncomeCents = 0;
  const expenseCatIds = new Set<number>();
  const incomeSrcIds = new Set<number>();
  const expenseByMonth: Record<string, number> = {};

  const dupTx = db.prepare(
    'SELECT 1 AS ok FROM transactions WHERE import_hash = ? LIMIT 1'
  );
  const dupInc = db.prepare(
    'SELECT 1 AS ok FROM income_actuals WHERE import_hash = ? LIMIT 1'
  );
  const catExists = db.prepare(
    'SELECT 1 AS ok FROM categories WHERE id = ? LIMIT 1'
  );
  const incomeSrcExists = db.prepare(
    'SELECT 1 AS ok FROM income_sources WHERE id = ? LIMIT 1'
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
        if (!Number.isFinite(row.targetId) || !catExists.get(row.targetId)) {
          staleTargets++;
          skipped++;
          continue;
        }
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
        addedExpenseCents += stored;
        expenseCatIds.add(row.targetId);
        const mk = row.date.length >= 7 ? row.date.slice(0, 7) : '';
        if (mk) {
          expenseByMonth[mk] = (expenseByMonth[mk] ?? 0) + stored;
        }
      } else if (row.targetType === 'income_source' && row.targetId != null) {
        if (!Number.isFinite(row.targetId) || !incomeSrcExists.get(row.targetId)) {
          staleTargets++;
          skipped++;
          continue;
        }
        const stored = Math.abs(row.amountCents);
        insertInc.run(
          row.targetId,
          row.date,
          row.merchant,
          stored,
          row.importHash
        );
        imported++;
        addedIncomeCents += stored;
        incomeSrcIds.add(row.targetId);
      } else {
        skipped++;
      }
    }
  });

  runBatch(rows);
  return {
    imported,
    skipped,
    duplicates,
    staleTargets,
    addedExpenseCents,
    addedIncomeCents,
    addedExpenseCategoryCount: expenseCatIds.size,
    addedIncomeSourceCount: incomeSrcIds.size,
    addedExpenseCentsByMonth: expenseByMonth,
  };
}

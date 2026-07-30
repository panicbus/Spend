import type Database from 'better-sqlite3';
import type { CommitImportResult, CommitImportRow } from './src/types/import.js';
import type { DedupeRow } from './dedupe.js';
import {
  analyzeImportCandidates,
  importSpaceAmount,
} from './dedupe.js';

export function runCommitImport(
  db: Database.Database,
  rows: CommitImportRow[]
): CommitImportResult {
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  let possibleDuplicates = 0;
  let staleTargets = 0;
  let addedExpenseCents = 0;
  let addedIncomeCents = 0;
  const expenseCatIds = new Set<number>();
  const incomeSrcIds = new Set<number>();
  const expenseByMonth: Record<string, number> = {};

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

  /**
   * Dedupe is decided up front, over the whole batch, so a row can also be
   * matched against earlier rows in the same file. Rows the user chose to skip
   * stay out of it — they are not going in, so they cannot shadow anything.
   */
  const candidates: DedupeRow[] = [];
  rows.forEach((row, i) => {
    if (row.skip) return;
    candidates.push({
      rowIndex: i,
      date: row.date,
      merchant: row.merchant,
      amountCents: importSpaceAmount(row.amountCents, row.targetType),
      originalStatement: row.originalStatement,
      account: row.account ?? '',
      importHash: row.importHash,
    });
  });
  const analysis = analyzeImportCandidates(db, candidates);
  const verdictByRow = new Map(
    analysis.matches.map((m) => [m.rowIndex, m.verdict])
  );

  const runBatch = db.transaction((batch: CommitImportRow[]) => {
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      if (row.skip) {
        skipped++;
        continue;
      }
      const verdict = verdictByRow.get(i);
      if (verdict === 'duplicate') {
        duplicates++;
        continue;
      }
      const possible = verdict === 'possible';
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
        if (possible) possibleDuplicates++;
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
        if (possible) possibleDuplicates++;
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
    possibleDuplicates,
    staleTargets,
    addedExpenseCents,
    addedIncomeCents,
    addedExpenseCategoryCount: expenseCatIds.size,
    addedIncomeSourceCount: incomeSrcIds.size,
    addedExpenseCentsByMonth: expenseByMonth,
  };
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeImportRows,
  accountsCompatible,
  labelsCompatible,
  normalizeDateKey,
  pairDuplicateRows,
  textTokens,
} from '../dedupe.ts';
import type { DedupeRow, ExistingRow, StoredRow } from '../dedupe.ts';

let seq = 0;

function incoming(over: Partial<DedupeRow> = {}): DedupeRow {
  return {
    rowIndex: seq++,
    date: '2026-05-09',
    merchant: 'Netflix',
    amountCents: -1999,
    originalStatement: 'Netflix.com',
    account: 'Cash Rewards Visa (...9726)',
    importHash: `hash-${seq}`,
    ...over,
  };
}

function existing(over: Partial<ExistingRow> = {}): ExistingRow {
  return {
    id: seq++,
    kind: 'transaction',
    date: '2026-05-09',
    merchant: 'Netflix',
    amountCents: -1999,
    originalStatement: 'Netflix.com',
    account: 'Cash Rewards Visa (...9726)',
    importHash: 'existing-hash',
    ...over,
  };
}

function verdicts(rows: DedupeRow[], pool: ExistingRow[]) {
  const analysis = analyzeImportRows(rows, pool);
  return new Map(analysis.matches.map((m) => [m.rowIndex, m.verdict]));
}

describe('normalizeDateKey', () => {
  it('pads ISO and converts M/D/YYYY', () => {
    assert.equal(normalizeDateKey('2026-5-9'), '2026-05-09');
    assert.equal(normalizeDateKey('5/9/2026'), '2026-05-09');
    assert.equal(normalizeDateKey(' 2026-05-09 '), '2026-05-09');
  });
});

describe('labelsCompatible', () => {
  it('matches a token-boundary prefix', () => {
    assert.ok(labelsCompatible(textTokens('Ross'), textTokens('Ross Stores')));
    assert.ok(
      labelsCompatible(
        textTokens('SAVERS - 1245'),
        textTokens('SAVERS - 1245 ALAMEDA CA')
      )
    );
  });

  it('rejects unrelated labels and bare fragments', () => {
    assert.ok(!labelsCompatible(textTokens('Target'), textTokens('Trader Joe')));
    assert.ok(!labelsCompatible(textTokens('A'), textTokens('A Big Store')));
    assert.ok(!labelsCompatible(textTokens('Ross'), textTokens('')));
  });
});

describe('accountsCompatible', () => {
  it('only conflicting card numbers rule a match out', () => {
    assert.ok(accountsCompatible('Visa (...9726)', 'Cash Rewards 9726'));
    assert.ok(accountsCompatible('', 'Visa (...9726)'));
    assert.ok(!accountsCompatible('Visa (...9726)', 'Amex (...1234)'));
  });
});

describe('analyzeImportRows', () => {
  it('catches a re-export whose statement grew a city and state', () => {
    // The bug: same charge, different original_statement, so different hash.
    const rows = [
      incoming({
        originalStatement: 'Netflix.com 408-5403700 CA',
        importHash: 'new-hash',
      }),
    ];
    const analysis = analyzeImportRows(rows, [existing()]);
    assert.equal(analysis.duplicateCount, 1);
    assert.equal(analysis.newCount, 0);
    assert.equal(analysis.matches[0].reason, 'same_day');
  });

  it('catches a merchant that gained a suffix between exports', () => {
    const rows = [
      incoming({
        date: '2026-05-05',
        merchant: 'Ross Stores',
        amountCents: -858,
        originalStatement: 'ROSS STORES #123 ALAMEDA CA',
      }),
    ];
    const pool = [
      existing({
        date: '2026-05-05',
        merchant: 'Ross',
        amountCents: -858,
        originalStatement: 'ROSS',
      }),
    ];
    assert.equal(analyzeImportRows(rows, pool).duplicateCount, 1);
  });

  it('still matches when the hash is identical', () => {
    const rows = [incoming({ importHash: 'shared' })];
    const analysis = analyzeImportRows(rows, [
      existing({ date: '2026-05-01', merchant: 'Whatever', importHash: 'shared' }),
    ]);
    assert.equal(analysis.matches[0].reason, 'hash');
  });

  it('imports a genuine second charge at the same merchant and amount', () => {
    // The file has two; the database has one — only one is a duplicate.
    const a = incoming({ merchant: 'ChargePoint', amountCents: -444 });
    const b = incoming({ merchant: 'ChargePoint', amountCents: -444 });
    const pool = [existing({ merchant: 'ChargePoint', amountCents: -444 })];
    const v = verdicts([a, b], pool);
    assert.equal(v.get(a.rowIndex), 'duplicate');
    // Flagged for a second look, but it still imports.
    assert.equal(v.get(b.rowIndex), 'possible');
    assert.equal(analyzeImportRows([a, b], pool).newCount, 1);
  });

  it('does not match across different cards', () => {
    const rows = [incoming({ account: 'Amex (...1234)' })];
    assert.equal(analyzeImportRows(rows, [existing()]).duplicateCount, 0);
  });

  it('does not match a different amount or an unrelated merchant', () => {
    const rows = [
      incoming({ amountCents: -2099 }),
      incoming({ merchant: 'Hulu', originalStatement: 'HULU 877-8244858 CA' }),
    ];
    assert.equal(analyzeImportRows(rows, [existing()]).duplicateCount, 0);
  });

  it('flags date drift as possible, not certain', () => {
    const rows = [incoming({ date: '2026-05-11' })];
    const analysis = analyzeImportRows(rows, [existing({ date: '2026-05-09' })]);
    assert.equal(analysis.duplicateCount, 0);
    assert.equal(analysis.possibleCount, 1);
    assert.equal(analysis.matches[0].reason, 'near_day');
    // Possible rows still import, so they count as new.
    assert.equal(analysis.newCount, 1);
  });

  it('leaves a repeat outside the drift window alone', () => {
    const rows = [incoming({ date: '2026-05-20' })];
    assert.equal(analyzeImportRows(rows, [existing()]).matches.length, 0);
  });

  it('drops a row repeated verbatim inside one file', () => {
    const a = incoming({ importHash: 'same' });
    const b = incoming({ importHash: 'same' });
    const v = verdicts([a, b], []);
    assert.equal(v.get(a.rowIndex), undefined);
    assert.equal(v.get(b.rowIndex), 'duplicate');
  });

  it('flags a same-file near-match rather than dropping it', () => {
    const a = incoming({
      merchant: 'Navadurga Handicraft',
      amountCents: -2212,
      originalStatement: 'NAVADURGA HANDICRAFT SI',
    });
    const b = incoming({
      merchant: 'Navadurga Handicraft',
      amountCents: -2212,
      originalStatement: 'NAVADURGA HANDICRAFT SIALAMEDA CA',
    });
    const v = verdicts([a, b], []);
    assert.equal(v.get(b.rowIndex), 'possible');
  });

  it('matches income rows in their own sign space', () => {
    const rows = [
      incoming({
        merchant: 'Paycheck',
        amountCents: 250000,
        originalStatement: 'ACME PAYROLL',
        account: '',
      }),
    ];
    const pool = [
      existing({
        kind: 'income',
        merchant: 'Paycheck',
        amountCents: 250000,
        originalStatement: 'Paycheck',
        account: '',
      }),
    ];
    assert.equal(analyzeImportRows(rows, pool).duplicateCount, 1);
  });

  it('reports nothing for an empty batch', () => {
    const analysis = analyzeImportRows([], [existing()]);
    assert.deepEqual(analysis, {
      matches: [],
      duplicateCount: 0,
      possibleCount: 0,
      newCount: 0,
    });
  });
});

function stored(over: Partial<StoredRow['row']> = {}, extra: Partial<StoredRow> = {}): StoredRow {
  const id = seq++;
  return {
    row: {
      id,
      kind: 'transaction',
      date: '2026-05-09',
      merchant: 'Netflix',
      amountCents: -1999,
      label: 'Subscriptions',
      account: 'Cash Rewards Visa (...9726)',
      source: 'csv',
      createdAt: `2026-05-10 0${id % 9}:00:00`,
      ...over,
    },
    originalStatement: 'Netflix.com',
    importHash: `stored-${id}`,
    ...extra,
  };
}

describe('pairDuplicateRows', () => {
  it('keeps the older copy and offers the newer one for removal', () => {
    const older = stored({ createdAt: '2026-05-10 01:00:00' });
    const newer = stored(
      { createdAt: '2026-06-01 01:00:00' },
      { originalStatement: 'Netflix.com 408-5403700 CA' }
    );
    const pairs = pairDuplicateRows([newer, older]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].keep.id, older.row.id);
    assert.equal(pairs[0].remove.id, newer.row.id);
    assert.equal(pairs[0].verdict, 'duplicate');
  });

  it('leaves one row behind when a charge landed three times', () => {
    const rows = [
      stored({ createdAt: '2026-05-10 01:00:00' }),
      stored({ createdAt: '2026-05-20 01:00:00' }),
      stored({ createdAt: '2026-06-01 01:00:00' }),
    ];
    const pairs = pairDuplicateRows(rows);
    assert.equal(pairs.length, 2);
    const removed = new Set(pairs.map((p) => p.remove.id));
    assert.ok(!removed.has(rows[0].row.id));
  });

  it('flags date drift as possible, not certain', () => {
    const pairs = pairDuplicateRows([
      stored({ createdAt: '2026-05-10 01:00:00' }),
      stored({ date: '2026-05-11', createdAt: '2026-06-01 01:00:00' }),
    ]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].verdict, 'possible');
    assert.equal(pairs[0].reason, 'near_day');
  });

  it('never pairs a transaction with an income row', () => {
    const pairs = pairDuplicateRows([
      stored({ amountCents: 1999, createdAt: '2026-05-10 01:00:00' }),
      stored({ kind: 'income', amountCents: 1999, createdAt: '2026-06-01 01:00:00' }),
    ]);
    assert.equal(pairs.length, 0);
  });

  it('leaves distinct charges alone', () => {
    const pairs = pairDuplicateRows([
      stored({ createdAt: '2026-05-10 01:00:00' }),
      stored({
        merchant: 'Trader Joe’s',
        amountCents: -4142,
        createdAt: '2026-06-01 01:00:00',
      }),
    ]);
    assert.equal(pairs.length, 0);
  });
});

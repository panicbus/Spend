import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CSV_PROFILES,
  profileToGenericMapping,
  getCSVProfile,
} from '../src/utils/csv-profiles.ts';
import { parseCsvDate } from '../src/utils/parseCsvDate.ts';
import {
  parseAmountToCents,
  amountCentsFromRow,
} from '../src/utils/parseCsvAmount.ts';
import { parseProfileCSV } from '../src/utils/csvProfileParser.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monarchFixture = path.join(__dirname, 'fixtures/monarch-sample.csv');

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
];

describe('csv-profiles', () => {
  it('monarch profile matches legacy Monarch column names', () => {
    const monarch = getCSVProfile('monarch');
    assert.ok(monarch);
    assert.equal(monarch.dateColumn, MONARCH_HEADERS[0]);
    assert.equal(monarch.merchantColumn, MONARCH_HEADERS[1]);
    assert.equal(monarch.categoryColumn, MONARCH_HEADERS[2]);
    assert.equal(monarch.accountColumn, MONARCH_HEADERS[3]);
    assert.equal(monarch.statementColumn, MONARCH_HEADERS[4]);
    assert.equal(monarch.notesColumn, MONARCH_HEADERS[5]);
    if (monarch.amountMode.type === 'single') {
      assert.equal(monarch.amountMode.column, MONARCH_HEADERS[6]);
      assert.equal(monarch.amountMode.expenseSign, 'negative');
    }
  });

  it('ships preset profiles including generic', () => {
    assert.ok(CSV_PROFILES.find((p) => p.id === 'chase_checking'));
    assert.ok(CSV_PROFILES.find((p) => p.id === 'generic'));
  });
});

describe('parseCsvDate', () => {
  it('passes through YYYY-MM-DD', () => {
    assert.equal(parseCsvDate('2026-01-05', 'YYYY-MM-DD', 'row 1'), '2026-01-05');
  });

  it('parses M/D/YYYY', () => {
    assert.equal(parseCsvDate('1/5/2026', 'M/D/YYYY', 'row 1'), '2026-01-05');
    assert.equal(parseCsvDate('01/05/2026', 'MM/DD/YYYY', 'row 1'), '2026-01-05');
  });
});

describe('parseAmountToCents', () => {
  it('handles dollars, commas, and parenthetical negatives', () => {
    assert.equal(parseAmountToCents('-45.67', 'row 1'), -4567);
    assert.equal(parseAmountToCents('$1,234.56', 'row 1'), 123456);
    assert.equal(parseAmountToCents('($125.50)', 'row 1'), -12550);
  });
});

describe('monarch sample CSV via profile parser', () => {
  const emptyDeps = {
    mappingSource: 'monarch',
    profileName: 'Monarch Money',
    loadMappingNameLookups: () => ({
      catNames: new Map<number, string>(),
      incomeNames: new Map<number, string>(),
    }),
    loadMappingRows: () => [],
  };

  it('parses fixture rows matching Monarch conventions', () => {
    const monarch = getCSVProfile('monarch');
    assert.ok(monarch);
    const result = parseProfileCSV(
      monarchFixture,
      profileToGenericMapping(monarch),
      emptyDeps
    );

    assert.equal(result.rows.length, 3);

    const row0 = result.rows[0];
    assert.equal(row0.date, '2026-01-15');
    assert.equal(row0.merchant, 'Whole Foods');
    assert.equal(row0.externalCategory, 'Groceries');
    assert.equal(row0.account, 'Checking');
    assert.equal(row0.originalStatement, 'WF #1234');
    assert.equal(row0.notes, '');
    assert.equal(row0.amountCents, -4567);
    assert.equal(row0.isIncome, false);

    const row1 = result.rows[1];
    assert.equal(row1.amountCents, 250000);
    assert.equal(row1.isIncome, true);

    const row2 = result.rows[2];
    assert.equal(row2.externalCategory, '');
    assert.equal(row2.amountCents, -1250);
    assert.deepEqual(result.unknownCategories, ['', 'Groceries', 'Paycheck']);
  });
});

describe('split amount columns', () => {
  const split = {
    type: 'split',
    debitColumn: 'Outflow',
    creditColumn: 'Inflow',
  } as const;
  const cents = (debit: string, credit: string) =>
    amountCentsFromRow({ Outflow: debit, Inflow: credit }, split, 'row 1');

  it('debit is expense and credit is income', () => {
    assert.equal(cents('50.00', ''), -5000);
    assert.equal(cents('', '100.00'), 10000);
  });

  it('treats a zero filler as an empty column', () => {
    // YNAB writes $0.00 into the column each row does not use.
    assert.equal(cents('$25.00', '$0.00'), -2500);
    assert.equal(cents('$0.00', '$1,000.00'), 100000);
  });

  it('reads a row that is zero on both sides as zero', () => {
    assert.equal(cents('$0.00', '$0.00'), 0);
  });

  it('ignores placeholder text in the unused column', () => {
    assert.equal(cents('$25.00', '-'), -2500);
    assert.equal(cents('n/a', '$40.00'), 4000);
  });

  it('still rejects two real amounts on one row', () => {
    assert.throws(() => cents('$25.00', '$40.00'), /Both debit and credit/);
  });

  it('still rejects a row with no amount at all', () => {
    assert.throws(() => cents('', ''), /Missing amount/);
  });
});

describe('YNAB export via profile parser', () => {
  const ynabFixture = path.join(__dirname, 'fixtures/ynab-sample.csv');
  const profile = getCSVProfile('ynab');

  it('imports a real YNAB register export', () => {
    assert.ok(profile);
    const { rows } = parseProfileCSV(
      ynabFixture,
      profileToGenericMapping(profile),
      {
        mappingSource: 'ynab',
        profileName: profile.name,
        loadMappingNameLookups: () => ({
          catNames: new Map(),
          incomeNames: new Map(),
        }),
        loadMappingRows: () => [],
      }
    );
    assert.equal(rows.length, 8);
    // Outflow rows are expenses despite the $0.00 inflow filler.
    assert.equal(rows[0].amountCents, -1000);
    assert.equal(rows[0].date, '2026-08-02');
    // Inflow row, comma in the amount.
    assert.equal(rows[6].amountCents, 250000);
    // Category names carry emoji and stray trailing spaces.
    assert.equal(rows[5].externalCategory, '\u{1F687} Transportation');
    // Payee is allowed to be blank.
    assert.equal(rows[4].merchant, '');
  });
});

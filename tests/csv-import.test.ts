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
  it('debit is expense and credit is income', () => {
    const cents = amountCentsFromRow(
      { Debit: '50.00', Credit: '' },
      { type: 'split', debitColumn: 'Debit', creditColumn: 'Credit' },
      'row 1'
    );
    assert.equal(cents, -5000);

    const income = amountCentsFromRow(
      { Debit: '', Credit: '100.00' },
      { type: 'split', debitColumn: 'Debit', creditColumn: 'Credit' },
      'row 2'
    );
    assert.equal(income, 10000);
  });
});

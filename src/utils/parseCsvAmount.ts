import type { AmountMode } from './csv-profiles.js';

/**
 * Signed cents from a dollar string (handles $, commas, parenthetical
 * negatives), or null when there is no number to read.
 */
function tryParseAmountCents(amountStr: string): number | null {
  const trimmed = amountStr.trim();
  if (!trimmed) return null;
  const paren = /^\((.+)\)$/.exec(trimmed);
  const s = paren ? `-${paren[1]}` : trimmed;
  const n = parseFloat(s.replace(/[$,\s]/g, ''));
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

/** Parse a dollar string to signed cents, naming the row if it will not parse. */
export function parseAmountToCents(amountStr: string, rowLabel: string): number {
  const cents = tryParseAmountCents(amountStr);
  if (cents == null) {
    throw new Error(`Invalid amount on ${rowLabel}: "${amountStr}".`);
  }
  return cents;
}

/**
 * One side of a debit/credit pair. Exports differ on how they say "nothing
 * here": YNAB writes `$0.00` in the unused column on every row, others leave it
 * blank or drop in a placeholder like `-`. Only a non-zero number counts as an
 * amount, so a zero filler cannot look like a second value.
 */
type AmountSide =
  | { kind: 'value'; cents: number }
  | { kind: 'zero' }
  | { kind: 'none' };

function amountSide(raw: string | undefined): AmountSide {
  // Blank, or placeholder text in the column this row does not use.
  const cents = tryParseAmountCents(raw ?? '');
  if (cents == null) return { kind: 'none' };
  return cents === 0 ? { kind: 'zero' } : { kind: 'value', cents };
}

/** Resolve signed cents from a row using single-column or split debit/credit mode. */
export function amountCentsFromRow(
  rec: Record<string, string>,
  amountMode: AmountMode,
  rowLabel: string
): number {
  if (amountMode.type === 'single') {
    const raw = rec[amountMode.column] ?? '';
    let cents = parseAmountToCents(raw, rowLabel);
    if (amountMode.expenseSign === 'positive') {
      cents = -cents;
    }
    return cents;
  }

  const debit = amountSide(rec[amountMode.debitColumn]);
  const credit = amountSide(rec[amountMode.creditColumn]);

  if (debit.kind === 'value' && credit.kind === 'value') {
    throw new Error(
      `Both debit and credit set on ${rowLabel}; expected only one.`
    );
  }
  if (debit.kind === 'value') return -Math.abs(debit.cents);
  if (credit.kind === 'value') return Math.abs(credit.cents);
  // A row that spells out zero is a real zero-amount row, not a broken one.
  if (debit.kind === 'zero' || credit.kind === 'zero') return 0;
  // Neither column holds a number — usually the wrong columns were mapped.
  throw new Error(`Missing amount on ${rowLabel}.`);
}

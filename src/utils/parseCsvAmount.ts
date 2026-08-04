import type { AmountMode } from './csv-profiles.js';

/** Parse a dollar string to signed cents (handles $, commas, parenthetical negatives). */
export function parseAmountToCents(amountStr: string, rowLabel: string): number {
  let s = amountStr.trim();
  if (!s) {
    throw new Error(`Invalid amount on ${rowLabel}: "${amountStr}".`);
  }

  const paren = /^\((.+)\)$/.exec(s);
  if (paren) {
    s = `-${paren[1]}`;
  }

  const cleaned = s.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid amount on ${rowLabel}: "${amountStr}".`);
  }
  return Math.round(n * 100);
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
  const s = (raw ?? '').trim();
  if (!s) return { kind: 'none' };
  let cents: number;
  try {
    cents = parseAmountToCents(s, '');
  } catch {
    // Placeholder text in the column this row does not use.
    return { kind: 'none' };
  }
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

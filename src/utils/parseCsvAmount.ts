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

function hasAmountValue(v: string | undefined): boolean {
  return (v ?? '').trim() !== '';
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

  const debitRaw = rec[amountMode.debitColumn] ?? '';
  const creditRaw = rec[amountMode.creditColumn] ?? '';
  const hasDebit = hasAmountValue(debitRaw);
  const hasCredit = hasAmountValue(creditRaw);

  if (hasDebit && hasCredit) {
    throw new Error(
      `Both debit and credit set on ${rowLabel}; expected only one.`
    );
  }
  if (hasDebit) {
    const n = parseAmountToCents(debitRaw, rowLabel);
    return -Math.abs(n);
  }
  if (hasCredit) {
    const n = parseAmountToCents(creditRaw, rowLabel);
    return Math.abs(n);
  }
  throw new Error(`Missing amount on ${rowLabel}.`);
}

import crypto from 'crypto';

/** SHA-256 of date|merchant|amountCents|originalStatement — shared by CSV and Monarch sync. */
export function computeImportHash(
  date: string,
  merchant: string,
  amountCents: number,
  originalStatement: string
): string {
  const payload =
    date + '|' + merchant + '|' + String(amountCents) + '|' + originalStatement;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

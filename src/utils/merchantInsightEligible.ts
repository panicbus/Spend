import type { MergedTransactionRow } from '../hooks/useTransactionList';
import type { Transaction } from '../types/transactions';

function displayMerchant(tx: Transaction): string {
  return (tx.merchant ?? '').trim();
}

/**
 * Single-merchant insight when search is non-empty and either:
 * - search text exactly matches an expense merchant (case-insensitive), or
 * - ≥80% of visible expense rows share the same merchant (case-insensitive exact).
 */
export function resolveMerchantForInsights(
  mergedRows: MergedTransactionRow[],
  debouncedSearch: string
): string | null {
  const q = debouncedSearch.trim();
  if (!q) return null;

  const expenseRows = mergedRows.filter((r) => r.kind === 'expense');
  if (expenseRows.length === 0) return null;

  const qLower = q.toLowerCase();

  for (const r of expenseRows) {
    const m = displayMerchant(r.tx);
    if (m && m.toLowerCase() === qLower) {
      return m;
    }
  }

  const counts = new Map<string, { display: string; n: number }>();
  for (const r of expenseRows) {
    const m = displayMerchant(r.tx);
    if (!m) continue;
    const key = m.toLowerCase();
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { display: m, n: 1 });
  }

  const total = expenseRows.length;
  let best: { display: string; n: number } | null = null;
  for (const v of counts.values()) {
    if (!best || v.n > best.n) best = v;
  }
  if (best && total > 0 && best.n / total >= 0.8) {
    return best.display;
  }
  return null;
}

/** Over budget: mild → severe (one emoji per tier). */
const FROWNS = ['😕', '☹️', '😣', '😩', '😵‍💫'] as const;

/** Under budget: calm → delighted (one emoji per tier). */
const SMILES = ['😌', '😀', '😃', '😆', '🥹'] as const;

/**
 * Tier 1–5 from how large `amount` is relative to `totalBudget` (5% / 15% / 30% / 45% steps).
 */
export function budgetMoodTier(amount: number, totalBudget: number): number {
  if (amount <= 0) return 1;
  if (totalBudget <= 0) return 2;
  const pct = amount / totalBudget;
  if (pct < 0.05) return 1;
  if (pct < 0.15) return 2;
  if (pct < 0.3) return 3;
  if (pct < 0.45) return 4;
  return 5;
}

/** Single mood emoji for summary “remaining / over budget” label. */
export function budgetMoodEmoji(
  amount: number,
  totalBudget: number,
  direction: 'over' | 'under'
): string {
  const tier = budgetMoodTier(amount, totalBudget);
  const faces = direction === 'over' ? FROWNS : SMILES;
  return faces[Math.min(tier - 1, faces.length - 1)];
}

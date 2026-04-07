export function formatCurrency(cents: number) {
  const n = (Number(cents) || 0) / 100;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatInputDollars(value: string) {
  const trimmed = String(value).trim();
  if (trimmed === '' || trimmed === '.') return 0;
  const n = Number.parseFloat(trimmed.replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export function dollarsFromCentsInput(cents: number) {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

export const CATEGORY_COLOR_PRESETS: ReadonlyArray<{
  label: string;
  value: string;
}> = [
  { label: 'Housing', value: '#3A7BD5' },
  { label: 'Utilities', value: '#6B5CE7' },
  { label: 'Food', value: '#2D9F75' },
  { label: 'Transport', value: '#E5953E' },
  { label: 'Personal', value: '#D94F4F' },
  { label: 'Entertainment', value: '#E76BAC' },
  { label: 'Gifts', value: '#9F6B2D' },
  { label: 'Savings', value: '#4FBCD9' },
];

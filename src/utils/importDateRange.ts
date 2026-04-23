import type { ParsedRow } from '../types/import';

/** Friendly date range line for import review (min/max of row dates). */
export function formatImportFileDateRange(rows: ParsedRow[]): string {
  if (rows.length === 0) return '';
  const times: number[] = [];
  for (const r of rows) {
    const t = new Date(`${r.date}T12:00:00`).getTime();
    if (!Number.isNaN(t)) times.push(t);
  }
  if (times.length === 0) return '';
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  const sameDay =
    min.getFullYear() === max.getFullYear() &&
    min.getMonth() === max.getMonth() &&
    min.getDate() === max.getDate();
  if (sameDay) {
    return `All transactions are from ${min.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}.`;
  }
  const sameMonth =
    min.getFullYear() === max.getFullYear() &&
    min.getMonth() === max.getMonth();
  if (sameMonth) {
    return `All transactions are from ${min.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    })}.`;
  }
  const a = min.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const b = max.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `This file covers ${a} – ${b}`;
}

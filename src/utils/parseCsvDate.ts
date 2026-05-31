import type { DateFormat } from './csv-profiles.js';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(y: number, m: number, d: number, rowLabel: string): string {
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d) ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {
    throw new Error(`Invalid date on ${rowLabel}.`);
  }
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    throw new Error(`Invalid date on ${rowLabel}.`);
  }
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Normalize a CSV date string to YYYY-MM-DD per profile format. */
export function parseCsvDate(
  dateStr: string,
  format: DateFormat,
  rowLabel: string
): string {
  const s = dateStr.trim();
  if (!s) {
    throw new Error(`Missing date on ${rowLabel}.`);
  }

  if (format === 'YYYY-MM-DD') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) {
      throw new Error(`Invalid date on ${rowLabel}: "${dateStr}".`);
    }
    return toIso(Number(m[1]), Number(m[2]), Number(m[3]), rowLabel);
  }

  if (format === 'MM/DD/YYYY' || format === 'M/D/YYYY') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!m) {
      throw new Error(`Invalid date on ${rowLabel}: "${dateStr}".`);
    }
    return toIso(Number(m[3]), Number(m[1]), Number(m[2]), rowLabel);
  }

  if (format === 'DD/MM/YYYY') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (!m) {
      throw new Error(`Invalid date on ${rowLabel}: "${dateStr}".`);
    }
    return toIso(Number(m[3]), Number(m[2]), Number(m[1]), rowLabel);
  }

  throw new Error(`Unsupported date format for ${rowLabel}.`);
}

import type Database from 'better-sqlite3';
import type {
  DedupeRow,
  DuplicateAnalysis,
  DuplicateMatch,
  DuplicatePair,
  DuplicateReason,
  DuplicateRow,
} from './src/types/import.js';

/**
 * Import dedupe: match incoming rows against what is already in the database.
 *
 * `import_hash` alone is not enough. Banks and Monarch rewrite the merchant and
 * the original statement between exports of the same charge —
 * "Netflix.com" becomes "Netflix.com 408-5403700 CA", "Ross" becomes
 * "Ross Stores" — so a re-export of an overlapping date range hashes
 * differently and sails straight past a hash-equality check.
 *
 * Matching here is field-by-field on normalized values, and it is 1:1: each
 * existing row can absorb at most one incoming row, so two genuinely separate
 * $4.44 charges on the same day still both import when the file contains both.
 * The one exception is a row repeated verbatim inside a single file — identical
 * down to the statement text. That reads as a doubled export rather than two
 * charges, so the repeat is dropped; see `analyzeImportRows` pass 3.
 *
 * Two verdicts:
 *   - `duplicate` — same day, same amount, compatible merchant/statement.
 *     Skipped on commit.
 *   - `possible`  — same amount within a few days (pending vs posted date), or a
 *     near-match inside the same file. Imported unless the user says otherwise;
 *     consecutive-day repeats at the same merchant are common and real.
 */

/** Days of date drift still treated as a possible pending/posted match. */
export const NEAR_DAY_WINDOW = 3;

export type {
  DedupeRow,
  DuplicateAnalysis,
  DuplicateMatch,
  DuplicatePair,
  DuplicateReason,
  DuplicateRow,
} from './src/types/import.js';

/** An existing row, with `amountCents` flipped back into import space (negative = expense). */
export type ExistingRow = {
  id: number;
  kind: 'transaction' | 'income';
  date: string;
  merchant: string;
  amountCents: number;
  originalStatement: string;
  account: string;
  importHash: string | null;
};

function pad2(v: string): string {
  return v.length === 1 ? `0${v}` : v;
}

/** Accepts YYYY-MM-DD and M/D/YYYY (what the CSV profiles emit) — anything else passes through. */
export function normalizeDateKey(raw: string): string {
  const s = (raw ?? '').trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (us) return `${us[3]}-${pad2(us[1])}-${pad2(us[2])}`;
  return s;
}

function dayNumber(dateKey: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
}

/** Lowercase, strip accents, split on anything non-alphanumeric. */
export function textTokens(raw: string): string[] {
  return (raw ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * True when one label is the other, or a token-boundary prefix of it:
 * "ross" ≈ "ross stores", "savers 1245" ≈ "savers 1245 alameda ca".
 * The shared part has to carry some signal, so a bare "a" matches nothing.
 */
export function labelsCompatible(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.join('').length < 3) return false;
  return short.every((t, i) => t === long[i]);
}

/** Last 4-digit run in an account label — "Cash Rewards Visa (...9726)" → "9726". */
export function accountDigits(raw: string | null | undefined): string {
  const digits = (raw ?? '').match(/\d{4,}/g);
  if (!digits || !digits.length) return '';
  return digits[digits.length - 1].slice(-4);
}

/** Account labels drift between exports, so only *conflicting* card numbers rule a match out. */
export function accountsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = accountDigits(a);
  const db = accountDigits(b);
  if (!da || !db) return true;
  return da === db;
}

/**
 * Amount in import space for a row headed to a given target: income lands in
 * `income_actuals` as a positive number whatever sign the file used.
 */
export function importSpaceAmount(
  amountCents: number,
  targetType: string
): number {
  return targetType === 'income_source' ? Math.abs(amountCents) : amountCents;
}

type Keyed = {
  dateKey: string;
  day: number | null;
  amountCents: number;
  merchant: string[];
  statement: string[];
  account: string;
  importHash: string;
};

function keyOf(row: {
  date: string;
  merchant: string;
  amountCents: number;
  originalStatement: string;
  account?: string | null;
  importHash?: string | null;
}): Keyed {
  const dateKey = normalizeDateKey(row.date);
  return {
    dateKey,
    day: dayNumber(dateKey),
    amountCents: row.amountCents,
    merchant: textTokens(row.merchant),
    statement: textTokens(row.originalStatement),
    account: row.account ?? '',
    importHash: row.importHash ?? '',
  };
}

/** Same charge described two ways: merchant lines up, or the raw statement does. */
function describesSameCharge(a: Keyed, b: Keyed): boolean {
  if (!accountsCompatible(a.account, b.account)) return false;
  return (
    labelsCompatible(a.merchant, b.merchant) ||
    labelsCompatible(a.statement, b.statement)
  );
}

type Candidate<T> = { row: T; key: Keyed; claimed: boolean };

function matchInfo(
  id: number | null,
  key: Keyed,
  merchant: string
): DuplicateMatch['existing'] {
  return {
    id,
    date: key.dateKey,
    merchant,
    amountCents: key.amountCents,
    account: key.account,
  };
}

/**
 * Classify each incoming row against `existing` (and against earlier rows in the
 * same batch). Rows are matched in order; every existing row is claimable once.
 */
export function analyzeImportRows(
  incoming: DedupeRow[],
  existing: ExistingRow[]
): DuplicateAnalysis {
  const pool: Candidate<ExistingRow>[] = existing.map((row) => ({
    row,
    key: keyOf(row),
    claimed: false,
  }));
  const byAmount = new Map<number, Candidate<ExistingRow>[]>();
  for (const c of pool) {
    const bucket = byAmount.get(c.key.amountCents);
    if (bucket) bucket.push(c);
    else byAmount.set(c.key.amountCents, [c]);
  }

  const rows: Candidate<DedupeRow>[] = incoming.map((row) => ({
    row,
    key: keyOf(row),
    claimed: false,
  }));
  const matches = new Map<number, DuplicateMatch>();

  const claim = (
    row: DedupeRow,
    candidate: Candidate<ExistingRow>,
    verdict: DuplicateMatch['verdict'],
    reason: DuplicateReason
  ): void => {
    candidate.claimed = true;
    matches.set(row.rowIndex, {
      rowIndex: row.rowIndex,
      verdict,
      reason,
      existing: matchInfo(candidate.row.id, candidate.key, candidate.row.merchant),
    });
  };

  const find = (
    key: Keyed,
    predicate: (c: Candidate<ExistingRow>) => boolean
  ): Candidate<ExistingRow> | undefined =>
    (byAmount.get(key.amountCents) ?? []).find((c) => !c.claimed && predicate(c));

  // Pass 1 — certain duplicates: identical hash, or same day and same charge.
  for (const item of rows) {
    const { key, row } = item;
    const byHash = key.importHash
      ? find(key, (c) => c.key.importHash === key.importHash)
      : undefined;
    if (byHash) {
      claim(row, byHash, 'duplicate', 'hash');
      item.claimed = true;
      continue;
    }
    const sameDay = find(
      key,
      (c) => c.key.dateKey === key.dateKey && describesSameCharge(c.key, key)
    );
    if (sameDay) {
      claim(row, sameDay, 'duplicate', 'same_day');
      item.claimed = true;
    }
  }

  // Pass 2 — pending/posted date drift, only for rows nothing exact claimed.
  for (const item of rows) {
    if (item.claimed) continue;
    const { key, row } = item;
    if (key.day == null) continue;
    const near = find(key, (c) => {
      if (c.key.day == null) return false;
      const diff = Math.abs(c.key.day - key.day!);
      return diff > 0 && diff <= NEAR_DAY_WINDOW && describesSameCharge(c.key, key);
    });
    if (near) {
      claim(row, near, 'possible', 'near_day');
      item.claimed = true;
    }
  }

  // Pass 3 — the file overlapping itself (a doubled export, or two exports concatenated).
  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    if (item.claimed) continue;
    for (let j = 0; j < i; j++) {
      const prior = rows[j];
      if (prior.key.amountCents !== item.key.amountCents) continue;
      const identical =
        !!item.key.importHash && prior.key.importHash === item.key.importHash;
      const sameCharge =
        prior.key.dateKey === item.key.dateKey &&
        describesSameCharge(prior.key, item.key);
      if (!identical && !sameCharge) continue;
      item.claimed = true;
      matches.set(item.row.rowIndex, {
        rowIndex: item.row.rowIndex,
        // A prior row that already matched the database is spoken for: flag this
        // echo of it rather than dropping a charge that may be genuinely separate.
        verdict: identical && !prior.claimed ? 'duplicate' : 'possible',
        reason: 'same_file',
        existing: matchInfo(null, prior.key, prior.row.merchant),
      });
      break;
    }
  }

  const list = [...matches.values()].sort((a, b) => a.rowIndex - b.rowIndex);
  const duplicateCount = list.filter((m) => m.verdict === 'duplicate').length;
  const possibleCount = list.length - duplicateCount;
  return {
    matches: list,
    duplicateCount,
    possibleCount,
    newCount: incoming.length - duplicateCount,
  };
}

/**
 * Existing rows that could collide with `dates`, in import space
 * (expenses negative, matching what a CSV row carries).
 */
export function loadExistingRows(
  db: Database.Database,
  dates: string[]
): ExistingRow[] {
  const days = dates
    .map((d) => dayNumber(normalizeDateKey(d)))
    .filter((d): d is number => d != null);
  if (!days.length) return [];
  const toIso = (day: number): string =>
    new Date(day * 86400000).toISOString().slice(0, 10);
  const start = toIso(Math.min(...days) - NEAR_DAY_WINDOW);
  const end = toIso(Math.max(...days) + NEAR_DAY_WINDOW);

  const txRows = db
    .prepare(
      `SELECT id, date, amount_cents,
              COALESCE(NULLIF(TRIM(merchant), ''), COALESCE(description, '')) AS merchant,
              COALESCE(original_statement, '') AS original_statement,
              COALESCE(account, '') AS account,
              import_hash
       FROM transactions
       WHERE date >= ? AND date <= ?`
    )
    .all(start, end) as {
    id: number;
    date: string;
    amount_cents: number;
    merchant: string;
    original_statement: string;
    account: string;
    import_hash: string | null;
  }[];

  const incRows = db
    .prepare(
      `SELECT id, date, amount_cents, COALESCE(description, '') AS description, import_hash
       FROM income_actuals
       WHERE date >= ? AND date <= ?`
    )
    .all(start, end) as {
    id: number;
    date: string;
    amount_cents: number;
    description: string;
    import_hash: string | null;
  }[];

  const out: ExistingRow[] = txRows.map((r) => ({
    id: r.id,
    kind: 'transaction' as const,
    date: r.date,
    merchant: r.merchant,
    // Expenses are stored positive; imports carry them negative.
    amountCents: -r.amount_cents,
    originalStatement: r.original_statement,
    account: r.account,
    importHash: r.import_hash,
  }));
  for (const r of incRows) {
    out.push({
      id: r.id,
      kind: 'income',
      date: r.date,
      merchant: r.description,
      amountCents: Math.abs(r.amount_cents),
      originalStatement: r.description,
      account: '',
      importHash: r.import_hash,
    });
  }
  return out;
}

/** A stored ledger row plus the fields matching needs but the UI does not show. */
export type StoredRow = {
  row: DuplicateRow;
  originalStatement: string;
  importHash: string | null;
};

/**
 * Pair up stored rows that look like the same charge — the import rules applied
 * to what is already in the ledger.
 *
 * Rows are walked oldest-first, so the copy that has been there longest is the
 * keeper and later copies are the ones offered for removal. Three copies of a
 * charge produce two pairs, leaving one row behind.
 */
export function pairDuplicateRows(stored: StoredRow[]): DuplicatePair[] {
  type Entry = {
    row: DuplicateRow;
    key: Keyed;
    /** Already the keeper of another pair — keeps matching 1:1. */
    usedAsKeeper: boolean;
    /** Already offered for removal, so it cannot be removed twice. */
    removed: boolean;
    /** The copy that survives if every pair is applied; itself until matched. */
    survivor: Entry;
  };

  const entries: Entry[] = stored.map((s) => {
    const entry: Entry = {
      row: s.row,
      key: keyOf({
        date: s.row.date,
        merchant: s.row.merchant,
        amountCents: s.row.amountCents,
        originalStatement: s.originalStatement,
        account: s.row.account,
        importHash: s.importHash,
      }),
      usedAsKeeper: false,
      removed: false,
      survivor: null as unknown as Entry,
    };
    entry.survivor = entry;
    return entry;
  });

  entries.sort((a, b) => {
    const byCreated = a.row.createdAt.localeCompare(b.row.createdAt);
    if (byCreated !== 0) return byCreated;
    return a.row.id - b.row.id;
  });

  // Only rows of the same kind and amount can pair, so compare within those
  // buckets instead of against the whole ledger.
  const buckets = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = `${e.row.kind}|${e.key.amountCents}`;
    const bucket = buckets.get(k);
    if (bucket) bucket.push(e);
    else buckets.set(k, [e]);
  }

  const pairs: DuplicatePair[] = [];

  const scan = (
    accept: (keeper: Entry, later: Entry) => DuplicateReason | null,
    verdict: DuplicatePair['verdict']
  ): void => {
    for (const bucket of buckets.values()) {
      for (let i = 0; i < bucket.length; i++) {
        const later = bucket[i];
        // Already spoken for: offered for removal, or promised as the row a
        // pair keeps — removing a keeper would strand the copy it answers for.
        if (later.removed || later.usedAsKeeper) continue;
        for (let j = 0; j < i; j++) {
          const earlier = bucket[j];
          if (earlier.usedAsKeeper) continue;
          // Judge against the copy that would actually survive, not the one
          // standing in front of it, so a run of matches cannot chain out past
          // the window it claims to be inside.
          const reason = accept(earlier.survivor, later);
          if (!reason) continue;
          earlier.usedAsKeeper = true;
          later.removed = true;
          // A charge stored three times pairs 2→1 then 3→2, and both point at
          // the one copy that is left standing.
          later.survivor = earlier.survivor;
          pairs.push({
            keep: earlier.survivor.row,
            remove: later.row,
            verdict,
            reason,
          });
          break;
        }
      }
    }
  };

  scan((keeper, later) => {
    if (keeper.key.importHash && keeper.key.importHash === later.key.importHash) {
      return 'hash';
    }
    if (
      keeper.key.dateKey === later.key.dateKey &&
      describesSameCharge(keeper.key, later.key)
    ) {
      return 'same_day';
    }
    return null;
  }, 'duplicate');

  scan((keeper, later) => {
    if (keeper.key.day == null || later.key.day == null) return null;
    const diff = Math.abs(keeper.key.day - later.key.day);
    if (diff === 0 || diff > NEAR_DAY_WINDOW) return null;
    return describesSameCharge(keeper.key, later.key) ? 'near_day' : null;
  }, 'possible');

  return pairs.sort(
    (a, b) =>
      b.remove.date.localeCompare(a.remove.date) || a.remove.id - b.remove.id
  );
}

/** Load the whole ledger and pair up its duplicates. */
export function findDuplicatePairs(db: Database.Database): DuplicatePair[] {
  const txRows = db
    .prepare(
      `SELECT t.id, t.date, t.amount_cents,
              COALESCE(NULLIF(TRIM(t.merchant), ''), COALESCE(t.description, '')) AS merchant,
              COALESCE(t.original_statement, '') AS original_statement,
              COALESCE(t.account, '') AS account,
              t.import_hash, COALESCE(t.created_at, '') AS created_at, t.source,
              COALESCE(c.name, '') AS label
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id`
    )
    .all() as {
    id: number;
    date: string;
    amount_cents: number;
    merchant: string;
    original_statement: string;
    account: string;
    import_hash: string | null;
    created_at: string;
    source: string;
    label: string;
  }[];

  const incRows = db
    .prepare(
      `SELECT ia.id, ia.date, ia.amount_cents,
              COALESCE(ia.description, '') AS description,
              ia.import_hash, COALESCE(ia.created_at, '') AS created_at,
              COALESCE(s.name, '') AS label
       FROM income_actuals ia
       LEFT JOIN income_sources s ON s.id = ia.source_id`
    )
    .all() as {
    id: number;
    date: string;
    amount_cents: number;
    description: string;
    import_hash: string | null;
    created_at: string;
    label: string;
  }[];

  const stored: StoredRow[] = txRows.map((r) => ({
    row: {
      id: r.id,
      kind: 'transaction' as const,
      date: r.date,
      merchant: r.merchant,
      // Display space: what the ledger shows (expenses negative).
      amountCents: -r.amount_cents,
      label: r.label,
      account: r.account,
      source: r.source === 'csv' ? ('csv' as const) : ('manual' as const),
      createdAt: r.created_at,
    },
    originalStatement: r.original_statement,
    importHash: r.import_hash,
  }));
  for (const r of incRows) {
    stored.push({
      row: {
        id: r.id,
        kind: 'income',
        date: r.date,
        merchant: r.description,
        amountCents: Math.abs(r.amount_cents),
        label: r.label,
        account: '',
        source: 'csv',
        createdAt: r.created_at,
      },
      originalStatement: r.description,
      importHash: r.import_hash,
    });
  }

  return pairDuplicateRows(stored);
}

/** Analyze rows the renderer is about to commit, against the live database. */
export function analyzeImportCandidates(
  db: Database.Database,
  rows: DedupeRow[]
): DuplicateAnalysis {
  if (!rows.length) {
    return { matches: [], duplicateCount: 0, possibleCount: 0, newCount: 0 };
  }
  return analyzeImportRows(rows, loadExistingRows(db, rows.map((r) => r.date)));
}

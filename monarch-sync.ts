/**
 * Monarch import over Monarch's official MCP server (https://api.monarch.com/mcp).
 *
 * Auth lives in monarchAuth.ts. This module opens an MCP session, pages through
 * the GetTransactions tool, and returns the rows in the same shape a parsed CSV
 * has, under mapping source `monarch`, so the Import page's mapping, review and
 * duplicate steps apply unchanged and earlier Monarch CSV mappings carry over.
 * The user starts every import; nothing is pulled in the background.
 *
 * Only posted transactions are fetched. A pending charge often posts later with
 * a different date or amount, and importing both would double-count it.
 *
 * Each row's import hash is derived from the Monarch transaction id, so a
 * transaction imported once is recognised exactly on every later fetch.
 */

import { app } from 'electron';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import type {
  MonarchFetchResult,
  MonarchImportRange,
  MonarchStatus,
} from './ipc-contract.js';
import type { ParsedRow } from './src/types/import.js';
import { analyzeImportCandidates } from './dedupe.js';
import { enrichParsedRowsWithMappings } from './importMapping.js';
import {
  MONARCH_MCP_URL,
  MONARCH_SIGN_IN_EXPIRED,
  MonarchAuthError,
  getMonarchAccessToken,
  isMonarchConnected,
} from './monarchAuth.js';

/** Kill switch for the whole feature (Import page button, Settings card). */
export const MONARCH_SYNC_UI_ENABLED = true;

const MAPPING_SOURCE = 'monarch';
const PROTOCOL_VERSION = '2025-06-18';
const PAGE_SIZE = 100;
/**
 * Loop guard only (100,000 rows). "All time" on a real account is thousands of
 * rows, about 54 pages for 5,400 transactions.
 */
const MAX_PAGES = 1000;

/** Months before the current one each range starts at; null means everything. */
const RANGE_MONTHS_BACK: Record<MonarchImportRange, number | null> = {
  this_month: 0,
  last_2_months: 1,
  last_3_months: 2,
  all_time: null,
};
/** GetTransactions requires a start date; Monarch accepts this one. */
const ALL_TIME_START = '1970-01-01';

/** Network, rate limit, or protocol trouble. Auth trouble is MonarchAuthError. */
class MonarchSyncError extends Error {}

export function getMonarchStatus(): MonarchStatus {
  return {
    available: MONARCH_SYNC_UI_ENABLED,
    connected: isMonarchConnected(),
  };
}

type RpcMessage = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
};

/** Pulls the JSON-RPC reply for `id` out of a plain JSON or SSE response body. */
async function readRpcReply(res: Response, id: number): Promise<RpcMessage> {
  const text = await res.text();
  const isSse = (res.headers.get('content-type') ?? '').includes(
    'text/event-stream'
  );
  const candidates = isSse
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
    : [text];
  for (const raw of candidates) {
    try {
      const msg = JSON.parse(raw) as RpcMessage;
      if (msg.id === id) return msg;
    } catch {
      /* not a JSON event */
    }
  }
  console.error('[Monarch sync] unexpected response:', text.slice(0, 500));
  throw new MonarchSyncError('Monarch returned an unexpected response.');
}

/** One Streamable HTTP MCP session: initialize once, then call tools. */
class McpSession {
  private nextId = 1;
  private sessionId: string | null = null;

  private constructor(private token: string) {}

  static async open(): Promise<McpSession> {
    const session = new McpSession(await getMonarchAccessToken());
    try {
      await session.initialize();
    } catch (e) {
      if (!(e instanceof MonarchAuthError)) throw e;
      // Revoked or expired early on Monarch's side; one refresh, then give up.
      session.token = await getMonarchAccessToken({ forceRefresh: true });
      await session.initialize();
    }
    return session;
  }

  callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args });
  }

  private async initialize() {
    this.sessionId = null;
    await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'Spend.', version: app.getVersion() },
    });
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }

  private async request(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const id = this.nextId++;
    const res = await this.post({ jsonrpc: '2.0', id, method, params });
    const reply = await readRpcReply(res, id);
    if (reply.error) {
      console.error('[Monarch sync] MCP error:', reply.error);
      throw new MonarchSyncError(
        reply.error.message ?? 'Monarch request failed.'
      );
    }
    return reply.result;
  }

  private async post(body: Record<string, unknown>): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(MONARCH_MCP_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': PROTOCOL_VERSION,
          ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.error('[Monarch sync] network error:', e);
      throw new MonarchSyncError(
        'Could not reach Monarch. Check your connection and try again.'
      );
    }
    if (res.status === 401) throw new MonarchAuthError(MONARCH_SIGN_IN_EXPIRED);
    if (res.status === 429) {
      throw new MonarchSyncError(
        'Monarch is rate limiting requests. Try again in a few minutes.'
      );
    }
    if (!res.ok) {
      console.error('[Monarch sync] HTTP', res.status, await res.text());
      throw new MonarchSyncError(`Monarch request failed (${res.status}).`);
    }
    this.sessionId = res.headers.get('mcp-session-id') ?? this.sessionId;
    return res;
  }
}

/** One transaction as GetTransactions returns it (amount < 0 is spending). */
type MonarchTransaction = {
  id: string;
  date: string;
  merchant?: string | null;
  amount: number;
  category?: string | null;
  account?: string | null;
};

type TransactionsPage = {
  transactions?: MonarchTransaction[];
  next_offset?: number | null;
};

/** GetTransactions answers with its JSON in a text content block. */
function parseTransactionsPage(result: unknown): TransactionsPage {
  const r = (result ?? {}) as {
    isError?: boolean;
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = r.content?.find((c) => c.type === 'text')?.text ?? '';
  if (r.isError) {
    throw new MonarchSyncError(
      text || 'Monarch could not return transactions.'
    );
  }
  try {
    let payload = JSON.parse(text) as unknown;
    // Some MCP hosts wrap the tool's JSON as {"result": "<json string>"}.
    const wrapped = (payload as { result?: unknown } | null)?.result;
    if (typeof wrapped === 'string') payload = JSON.parse(wrapped);
    return payload as TransactionsPage;
  } catch {
    console.error(
      '[Monarch sync] unparseable tool result:',
      text.slice(0, 500)
    );
    throw new MonarchSyncError(
      'Monarch returned transactions in an unexpected format.'
    );
  }
}

async function fetchMonarchTransactions(
  startDate: string,
  endDate: string
): Promise<MonarchTransaction[]> {
  const session = await McpSession.open();
  const all: MonarchTransaction[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = parseTransactionsPage(
      await session.callTool('GetTransactions', {
        start_date: startDate,
        end_date: endDate,
        intent: 'budgeting',
        limit: PAGE_SIZE,
        offset,
        filters: JSON.stringify({ transaction_type: 'All', is_pending: false }),
      })
    );
    all.push(...(result.transactions ?? []));
    const next = result.next_offset;
    if (typeof next !== 'number' || next <= offset) break;
    offset = next;
  }
  return all;
}

function monarchImportHash(transactionId: string): string {
  return crypto
    .createHash('sha256')
    .update(`monarch:${transactionId}`, 'utf8')
    .digest('hex');
}

function toParsedRows(transactions: MonarchTransaction[]): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const tx of transactions) {
    if (!tx?.id || !tx.date || typeof tx.amount !== 'number') continue;
    const merchant = tx.merchant?.trim() ?? '';
    const amountCents = Math.round(tx.amount * 100);
    rows.push({
      rowIndex: rows.length,
      date: tx.date.slice(0, 10),
      merchant,
      externalCategory: tx.category?.trim() ?? '',
      amountCents,
      isIncome: amountCents > 0,
      // GetTransactions has no bank statement text outside detail mode (20 rows max).
      originalStatement: merchant,
      notes: '',
      account: tx.account?.trim() ?? '',
      importHash: monarchImportHash(tx.id),
      mapping: null,
    });
  }
  return rows;
}

/**
 * From the 1st of the range's first month (or the beginning, for all_time)
 * through today. A transaction skipped because it was not labeled or split in
 * Monarch yet is offered again by the next import whose range covers it.
 */
function fetchDateRange(range: MonarchImportRange): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const endDate = now.toLocaleDateString('en-CA');
  const back = RANGE_MONTHS_BACK[range];
  if (back == null) return { startDate: ALL_TIME_START, endDate };
  const start = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return { startDate: start.toLocaleDateString('en-CA'), endDate };
}

function toImportRange(raw: unknown): MonarchImportRange {
  return typeof raw === 'string' && Object.hasOwn(RANGE_MONTHS_BACK, raw)
    ? (raw as MonarchImportRange)
    : 'this_month';
}

/**
 * Drops rows Spend. already has for certain: earlier MCP imports (same Monarch
 * id) and the same charge from a CSV import. Near-matches stay in, and the
 * Import page's duplicate check asks about them before committing.
 */
function withoutImported(db: Database.Database, rows: ParsedRow[]) {
  const analysis = analyzeImportCandidates(
    db,
    rows.map((r) => ({
      rowIndex: r.rowIndex,
      date: r.date,
      merchant: r.merchant,
      amountCents: r.amountCents,
      originalStatement: r.originalStatement,
      account: r.account,
      importHash: r.importHash,
    }))
  );
  const imported = new Set(
    analysis.matches
      .filter((m) => m.verdict === 'duplicate')
      .map((m) => m.rowIndex)
  );
  return rows
    .filter((r) => !imported.has(r.rowIndex))
    .map((r, i) => ({ ...r, rowIndex: i }));
}

/**
 * Posted Monarch transactions in `range` that are not in Spend. yet, with category mappings applied. Nothing is written here; the
 * rows go through the Import page's review like a parsed CSV.
 */
export async function fetchMonarchImportRows(
  db: Database.Database,
  range: unknown
): Promise<MonarchFetchResult> {
  if (!isMonarchConnected()) {
    return {
      status: 'error',
      message: 'Monarch is not connected. Click the link below to connect it.',
      reconnect: true,
    };
  }
  try {
    const { startDate, endDate } = fetchDateRange(toImportRange(range));
    const transactions = await fetchMonarchTransactions(startDate, endDate);
    const fresh = withoutImported(db, toParsedRows(transactions));
    const { rows, unknownCategories } = enrichParsedRowsWithMappings(
      db,
      fresh,
      MAPPING_SOURCE
    );
    return { status: 'ok', rows, unknownCategories };
  } catch (e) {
    if (e instanceof MonarchAuthError) {
      return { status: 'error', message: e.message, reconnect: true };
    }
    if (!(e instanceof MonarchSyncError)) {
      console.error('[Monarch MCP] unexpected error:', e);
    }
    const message =
      e instanceof Error ? e.message : 'Monarch import failed unexpectedly.';
    return { status: 'error', message };
  }
}

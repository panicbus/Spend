/**
 * Monarch MCP sync — DORMANT
 *
 * This module is built but disabled in this version because Monarch's auth
 * model doesn't allow static bearer tokens. Reviving this feature requires
 * either:
 *
 * 1. OAuth 2.0 flow in Electron with PKCE callback + macOS Keychain storage,
 *    matching the official MCP server at https://api.monarch.com/mcp, OR
 *
 * 2. Programmatic GraphQL login with email/password/MFA against the
 *    unofficial api.monarch.com/graphql endpoint (less ideal — relies on
 *    a private API).
 *
 * The sync UI is gated on isMonarchSyncEnabled() which always returns false
 * in this version. To re-enable in development, change MONARCH_SYNC_UI_ENABLED
 * in monarch-sync.ts and implement one of the auth flows above.
 */

import type Database from 'better-sqlite3';
import type { ParsedRow } from './src/types/import.js';
import { computeImportHash } from './importHash.js';
import {
  enrichParsedRowsWithMappings,
  parsedRowsToCommitRows,
} from './importMapping.js';
import { runCommitImport } from './importCommit.js';

export type MonarchSyncResult =
  | { status: 'no-new'; lastSyncDate: string }
  | { status: 'needs-mapping'; rows: ParsedRow[]; unmappedCategories: string[] }
  | { status: 'imported'; transactionCount: number; lastSyncDate: string }
  | { status: 'error'; message: string };

const DEFAULT_MCP_URL = 'https://api.monarch.com/mcp';
const MAPPING_SOURCE = 'monarch';
const SETTINGS_KEY_LAST_MONARCH_SYNC = 'last_monarch_sync';

/** Set true after implementing OAuth or GraphQL login (see module header). */
export const MONARCH_SYNC_UI_ENABLED = false;

let cachedTools: MCPTool[] | null = null;
let cachedTransactionToolName: string | null = null;

type MCPTool = {
  name: string;
  description?: string;
  inputSchema?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

type MonarchSyncDeps = {
  db: Database.Database;
};

function monarchToken(): string | null {
  const t = process.env.MONARCH_TOKEN?.trim();
  return t || null;
}

export function isMonarchSyncEnabled(): boolean {
  if (!MONARCH_SYNC_UI_ENABLED) return false;
  return monarchToken() != null;
}

function mcpUrl(): string {
  return process.env.MONARCH_MCP_URL?.trim() || DEFAULT_MCP_URL;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function getLastMonarchSync(db: Database.Database): string | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(SETTINGS_KEY_LAST_MONARCH_SYNC) as { value: string } | undefined;
  const v = row?.value?.trim();
  return v || null;
}

function setLastMonarchSync(db: Database.Database, isoDate: string) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    SETTINGS_KEY_LAST_MONARCH_SYNC,
    isoDate
  );
}

async function mcpRequest(
  method: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const token = monarchToken();
  if (!token) {
    throw new MonarchSyncError('Monarch sync is not configured.', 'disabled');
  }

  const body = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  let res: Response;
  try {
    res = await fetch(mcpUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('[Monarch sync] network error:', e);
    throw new MonarchSyncError(
      'Could not reach Monarch. Check your network and try again.',
      'network'
    );
  }

  if (res.status === 401) {
    throw new MonarchSyncError(
      'Monarch token expired. Re-authorize via Claude Code and update your .env.build.',
      'auth'
    );
  }
  if (res.status === 429) {
    throw new MonarchSyncError(
      'Rate limited by Monarch. Try again in a few minutes.',
      'rate'
    );
  }

  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    console.error('[Monarch sync] non-JSON response:', text.slice(0, 500));
    throw new MonarchSyncError(
      `Monarch returned an unexpected response (${res.status}).`,
      'parse'
    );
  }

  const rpc = payload as {
    error?: { message?: string; code?: number };
    result?: unknown;
  };

  if (rpc.error) {
    console.error('[Monarch sync] MCP error:', rpc.error);
    const msg = rpc.error.message ?? 'Monarch MCP request failed.';
    if (res.status === 401 || msg.toLowerCase().includes('unauthorized')) {
      throw new MonarchSyncError(
        'Monarch token expired. Re-authorize via Claude Code and update your .env.build.',
        'auth'
      );
    }
    throw new MonarchSyncError(msg, 'mcp');
  }

  if (!res.ok) {
    console.error('[Monarch sync] HTTP error:', res.status, payload);
    throw new MonarchSyncError(
      `Monarch request failed (${res.status}).`,
      'http'
    );
  }

  return rpc.result;
}

class MonarchSyncError extends Error {
  readonly kind: string;
  constructor(message: string, kind: string) {
    super(message);
    this.kind = kind;
  }
}

async function listTools(): Promise<MCPTool[]> {
  if (cachedTools) return cachedTools;
  const result = await mcpRequest('tools/list', {});
  console.log('[Monarch sync] tools/list response:', JSON.stringify(result, null, 2));

  const tools = extractTools(result);
  cachedTools = tools;
  return tools;
}

function extractTools(result: unknown): MCPTool[] {
  if (!result || typeof result !== 'object') return [];
  const r = result as Record<string, unknown>;
  const raw = r.tools;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is MCPTool =>
      t != null &&
      typeof t === 'object' &&
      typeof (t as MCPTool).name === 'string'
  );
}

function pickTransactionTool(tools: MCPTool[]): MCPTool | null {
  const patterns = [
    /^get_transactions$/i,
    /^getTransactions$/i,
    /^list_transactions$/i,
    /^transactions\.list$/i,
    /^transactions$/i,
    /transaction/i,
  ];
  for (const p of patterns) {
    const hit = tools.find((t) => p.test(t.name));
    if (hit) return hit;
  }
  return null;
}

function buildDateArguments(
  tool: MCPTool,
  startDate: string,
  endDate: string
): Record<string, unknown> {
  const schema = tool.inputSchema?.properties ?? {};
  const keys = Object.keys(schema);
  const lower = (s: string) => s.toLowerCase();

  const startCandidates = [
    'start_date',
    'startDate',
    'from',
    'date_from',
    'dateFrom',
  ];
  const endCandidates = ['end_date', 'endDate', 'to', 'date_to', 'dateTo'];

  const args: Record<string, unknown> = {};

  for (const k of keys) {
    const lk = lower(k);
    if (startCandidates.some((c) => lower(c) === lk)) {
      args[k] = startDate;
    } else if (endCandidates.some((c) => lower(c) === lk)) {
      args[k] = endDate;
    }
  }

  if (Object.keys(args).length >= 2) return args;

  if (keys.some((k) => lower(k) === 'daterange' || lower(k) === 'date_range')) {
    const key = keys.find((k) => lower(k) === 'daterange' || lower(k) === 'date_range')!;
    return { [key]: { start: startDate, end: endDate } };
  }

  return {
    start_date: startDate,
    end_date: endDate,
  };
}

async function fetchMonarchTransactions(
  startDate: string,
  endDate: string
): Promise<unknown[]> {
  const tools = await listTools();
  const tool =
    (cachedTransactionToolName
      ? tools.find((t) => t.name === cachedTransactionToolName)
      : null) ?? pickTransactionTool(tools);

  if (!tool) {
    const names = tools.map((t) => t.name).join(', ') || '(none)';
    throw new MonarchSyncError(
      `No transaction tool found in Monarch MCP. Available: ${names}`,
      'tool'
    );
  }

  cachedTransactionToolName = tool.name;
  const arguments_ = buildDateArguments(tool, startDate, endDate);
  console.log(
    `[Monarch sync] tools/call ${tool.name}`,
    JSON.stringify(arguments_, null, 2)
  );
  if (tool.inputSchema) {
    console.log('[Monarch sync] tool schema:', JSON.stringify(tool.inputSchema, null, 2));
  }

  const result = await mcpRequest('tools/call', {
    name: tool.name,
    arguments: arguments_,
  });

  console.log('[Monarch sync] tools/call response:', JSON.stringify(result, null, 2));
  return extractTransactions(result);
}

function extractTransactions(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;

  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;

    if (Array.isArray(r.transactions)) return r.transactions;
    if (Array.isArray(r.items)) return r.items;
    if (Array.isArray(r.data)) return r.data;

    const content = r.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;
        if (b.type === 'text' && typeof b.text === 'string') {
          try {
            const parsed = JSON.parse(b.text) as unknown;
            const nested = extractTransactions(parsed);
            if (nested.length) return nested;
          } catch {
            /** try next block */
          }
        }
        if (Array.isArray(b.transactions)) return b.transactions;
      }
    }

    if (typeof r.structuredContent === 'object' && r.structuredContent) {
      return extractTransactions(r.structuredContent);
    }
  }

  return [];
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = parseFloat(v.replace(/[$,\s]/g, ''));
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function normalizeIsoDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function amountToCents(obj: Record<string, unknown>): number {
  const cents = pickNumber(obj, [
    'amount_cents',
    'amountCents',
    'amount_in_cents',
  ]);
  if (cents != null) return Math.round(cents);

  const amount = pickNumber(obj, ['amount', 'value', 'total']);
  if (amount == null) return 0;
  return Math.round(amount * 100);
}

function monarchRecordToParsedRow(rec: unknown, index: number): ParsedRow | null {
  if (!rec || typeof rec !== 'object') return null;
  const o = rec as Record<string, unknown>;

  const dateRaw = pickString(o, [
    'date',
    'transaction_date',
    'posted_date',
    'postedDate',
    'transactionDate',
  ]);
  if (!dateRaw) return null;

  const date = normalizeIsoDate(dateRaw);
  const merchant = pickString(o, [
    'merchant',
    'payee',
    'name',
    'description',
    'merchant_name',
    'merchantName',
  ]);
  const externalCategory = pickString(o, [
    'category',
    'category_name',
    'categoryName',
    'external_category',
  ]);
  const originalStatement = pickString(o, [
    'original_statement',
    'originalStatement',
    'statement',
    'description',
    'memo',
  ]);
  const notes = pickString(o, ['notes', 'note', 'memo']) || '';
  const account = pickString(o, ['account', 'account_name', 'accountName']);
  const amountCents = amountToCents(o);

  const importHash = computeImportHash(
    date,
    merchant,
    amountCents,
    originalStatement || merchant
  );

  return {
    rowIndex: index,
    date,
    merchant,
    externalCategory,
    amountCents,
    isIncome: amountCents > 0,
    originalStatement: originalStatement || merchant,
    notes,
    account,
    importHash,
    mapping: null,
  };
}

function transformMonarchRecords(records: unknown[]): ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (let i = 0; i < records.length; i++) {
    const row = monarchRecordToParsedRow(records[i], i);
    if (row) rows.push(row);
  }
  return rows;
}

function syncDateRange(db: Database.Database): { startDate: string; endDate: string } {
  const endDate = todayIsoDate();
  const last = getLastMonarchSync(db);
  const startDate = last ?? daysAgoIso(30);
  return { startDate, endDate };
}

function finalizeSync(
  db: Database.Database,
  rows: ParsedRow[]
): MonarchSyncResult {
  const { rows: enriched, unknownCategories } = enrichParsedRowsWithMappings(
    db,
    rows,
    MAPPING_SOURCE
  );

  if (unknownCategories.length > 0) {
    return {
      status: 'needs-mapping',
      rows: enriched,
      unmappedCategories: unknownCategories,
    };
  }

  const commitRows = parsedRowsToCommitRows(enriched);
  const result = runCommitImport(db, commitRows);
  const lastSyncDate = todayIsoDate();
  setLastMonarchSync(db, lastSyncDate);

  if (result.imported === 0) {
    return { status: 'no-new', lastSyncDate };
  }

  return {
    status: 'imported',
    transactionCount: result.imported,
    lastSyncDate,
  };
}

export async function syncFromMonarch(
  deps: MonarchSyncDeps
): Promise<MonarchSyncResult> {
  if (!isMonarchSyncEnabled()) {
    return { status: 'error', message: 'Monarch sync is not configured.' };
  }

  try {
    const { startDate, endDate } = syncDateRange(deps.db);
    const records = await fetchMonarchTransactions(startDate, endDate);
    const rows = transformMonarchRecords(records);

    if (rows.length === 0) {
      const lastSyncDate = todayIsoDate();
      setLastMonarchSync(deps.db, lastSyncDate);
      return { status: 'no-new', lastSyncDate };
    }

    return finalizeSync(deps.db, rows);
  } catch (e) {
    if (e instanceof MonarchSyncError) {
      return { status: 'error', message: e.message };
    }
    console.error('[Monarch sync] unexpected error:', e);
    const message =
      e instanceof Error ? e.message : 'Monarch sync failed unexpectedly.';
    return { status: 'error', message };
  }
}

export function commitMappedMonarchRows(
  deps: MonarchSyncDeps,
  rows: ParsedRow[]
): { transactionCount: number } {
  const { rows: enriched, unknownCategories } = enrichParsedRowsWithMappings(
    deps.db,
    rows,
    MAPPING_SOURCE
  );

  if (unknownCategories.length > 0) {
    throw new Error(
      `Still unmapped categories: ${unknownCategories.join(', ')}`
    );
  }

  const commitRows = parsedRowsToCommitRows(enriched);
  const result = runCommitImport(deps.db, commitRows);
  setLastMonarchSync(deps.db, todayIsoDate());
  return { transactionCount: result.imported };
}

/** Reset cached MCP tool discovery (for tests). */
export function resetMonarchSyncCache() {
  cachedTools = null;
  cachedTransactionToolName = null;
}

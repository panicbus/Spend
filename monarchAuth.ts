/**
 * Sign-in for Monarch's MCP server (https://api.monarch.com/mcp).
 *
 * This is the standard MCP auth flow, the same one Claude and other MCP clients
 * run: dynamic client registration, then authorization code + PKCE (S256) with
 * a loopback redirect. Spend. holds no client secret; the user approves access
 * on monarch.com in their own browser. Scope is read-only (`mcp:read`).
 *
 * Tokens are encrypted with safeStorage (Keychain-backed) and kept in their own
 * file in userData, not in the SQLite database, so they never end up inside an
 * exported backup and survive "Import from backup" / "Reset all data".
 */

import { app, safeStorage, shell } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';

export const MONARCH_MCP_URL = 'https://api.monarch.com/mcp';

/** From https://api.monarch.com/.well-known/oauth-authorization-server */
const AUTHORIZE_URL = 'https://api.monarch.com/oauth/authorize/';
const TOKEN_URL = 'https://api.monarch.com/oauth/token/';
const REGISTER_URL = 'https://api.monarch.com/oauth/register';
const REVOKE_URL = 'https://api.monarch.com/oauth/revoke/';
const SCOPE = 'mcp:read';

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
/** Refresh a little early so a token never expires mid-sync. */
const EXPIRY_SKEW_MS = 60 * 1000;

const NOT_CONNECTED = 'Monarch is not connected. Connect it in Settings.';
export const MONARCH_SIGN_IN_EXPIRED =
  'Your Monarch sign-in expired. Reconnect it in Settings → Import mappings.';

type StoredAuth = {
  clientId: string;
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms, or null when Monarch did not say. */
  expiresAt: number | null;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

/** The user has to sign in (again). Anything else is network or server trouble. */
export class MonarchAuthError extends Error {}

function authFilePath(): string {
  return path.join(app.getPath('userData'), 'monarch-auth.bin');
}

function readAuth(): StoredAuth | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const blob = fs.readFileSync(authFilePath());
    return JSON.parse(safeStorage.decryptString(blob)) as StoredAuth;
  } catch {
    return null;
  }
}

function writeAuth(auth: StoredAuth) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('macOS Keychain encryption is unavailable.');
  }
  fs.writeFileSync(
    authFilePath(),
    safeStorage.encryptString(JSON.stringify(auth)),
    { mode: 0o600 }
  );
}

function clearAuth() {
  fs.rmSync(authFilePath(), { force: true });
}

export function isMonarchConnected(): boolean {
  return readAuth() != null;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function toStored(
  clientId: string,
  tokens: TokenResponse,
  previousRefreshToken: string | null
): StoredAuth {
  if (!tokens.access_token) {
    throw new Error('Monarch did not return an access token.');
  }
  return {
    clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previousRefreshToken,
    expiresAt:
      typeof tokens.expires_in === 'number'
        ? Date.now() + tokens.expires_in * 1000
        : null,
  };
}

async function tokenRequest(
  params: Record<string, string>
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(params),
  });
  if (res.status === 400 || res.status === 401) {
    console.error('[Monarch auth] token error:', await res.text());
    throw new MonarchAuthError(MONARCH_SIGN_IN_EXPIRED);
  }
  if (!res.ok) {
    throw new Error(`Monarch sign-in failed (${res.status}).`);
  }
  return (await res.json()) as TokenResponse;
}

async function registerClient(redirectUri: string): Promise<string> {
  const res = await fetch(REGISTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Spend.',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { client_id?: string };
  if (!res.ok || !body.client_id) {
    throw new Error(`Could not register Spend. with Monarch (${res.status}).`);
  }
  return body.client_id;
}

function callbackPage(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Spend.</title>
<body style="font:16px -apple-system,system-ui;display:grid;place-items:center;height:90vh;margin:0">
<p>${message}</p></body>`;
}

/**
 * Listens on a random 127.0.0.1 port for the OAuth redirect. The port is picked
 * before registration, so each sign-in registers its exact redirect URI.
 */
function listenForCallback(state: string): Promise<{
  redirectUri: string;
  code: Promise<string>;
  close: () => void;
}> {
  let settle!: { resolve: (code: string) => void; reject: (e: Error) => void };
  const code = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // Awaited later; this only keeps an early rejection from going unhandled.
  code.catch(() => undefined);

  const timer = setTimeout(
    () =>
      settle.reject(
        new MonarchAuthError('Monarch sign-in timed out. Try again.')
      ),
    SIGN_IN_TIMEOUT_MS
  );

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    const got = url.searchParams.get('code');
    const ok =
      !url.searchParams.get('error') &&
      got &&
      url.searchParams.get('state') === state;
    res
      .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      .end(
        callbackPage(
          ok
            ? 'Monarch is connected. You can close this tab and return to Spend.'
            : 'Monarch was not connected. Return to Spend. and try again.'
        )
      );
    if (ok) settle.resolve(got);
    else settle.reject(new MonarchAuthError('Monarch access was not granted.'));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        redirectUri: `http://127.0.0.1:${port}/callback`,
        code,
        close: () => {
          clearTimeout(timer);
          server.close();
          server.closeAllConnections();
        },
      });
    });
  });
}

async function runSignIn(): Promise<void> {
  const state = base64url(crypto.randomBytes(16));
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash('sha256').update(verifier).digest()
  );

  const callback = await listenForCallback(state);
  try {
    const clientId = await registerClient(callback.redirectUri);
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: callback.redirectUri,
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: MONARCH_MCP_URL,
    }).toString();
    await shell.openExternal(url.toString());

    const code = await callback.code;
    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callback.redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource: MONARCH_MCP_URL,
    });
    writeAuth(toStored(clientId, tokens, null));
  } finally {
    callback.close();
  }
}

let pendingSignIn: Promise<void> | null = null;

/** Opens Monarch's consent page in the browser and resolves once the user approves. */
export function connectMonarch(): Promise<void> {
  pendingSignIn ??= runSignIn().finally(() => {
    pendingSignIn = null;
  });
  return pendingSignIn;
}

export async function disconnectMonarch(): Promise<void> {
  const auth = readAuth();
  clearAuth();
  if (!auth?.refreshToken) return;
  // Best effort: the local tokens are already gone either way.
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: auth.refreshToken,
      token_type_hint: 'refresh_token',
      client_id: auth.clientId,
    }),
  }).catch(() => undefined);
}

/**
 * A usable access token, refreshed when it is about to expire or when
 * `forceRefresh` is set (after the MCP server answered 401).
 */
export async function getMonarchAccessToken({
  forceRefresh = false,
} = {}): Promise<string> {
  const auth = readAuth();
  if (!auth) throw new MonarchAuthError(NOT_CONNECTED);

  const fresh =
    auth.expiresAt == null || auth.expiresAt - EXPIRY_SKEW_MS > Date.now();
  if (fresh && !forceRefresh) return auth.accessToken;

  if (!auth.refreshToken) {
    clearAuth();
    throw new MonarchAuthError(MONARCH_SIGN_IN_EXPIRED);
  }
  let tokens: TokenResponse;
  try {
    tokens = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken,
      client_id: auth.clientId,
      resource: MONARCH_MCP_URL,
    });
  } catch (e) {
    if (e instanceof MonarchAuthError) clearAuth();
    throw e;
  }
  const next = toStored(auth.clientId, tokens, auth.refreshToken);
  writeAuth(next);
  return next.accessToken;
}

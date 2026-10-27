import { api } from '../services/api';

/**
 * Runs the Monarch browser sign-in. Resolves to null on success, or a message
 * to show; Electron's "Error invoking remote method …" wrapper is stripped.
 */
export async function connectMonarchAccount(): Promise<string | null> {
  try {
    await api.connectMonarch();
    return null;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return raw.replace(
      /^Error invoking remote method '[^']+': (\w*Error: )?/,
      ''
    );
  }
}

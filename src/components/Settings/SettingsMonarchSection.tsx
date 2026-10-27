import { useCallback, useEffect, useState } from 'react';
import type { MonarchStatus } from '../../../ipc-contract';
import { api } from '../../services/api';
import { connectMonarchAccount } from '../../utils/monarchConnect';
import { Button } from '../common/Button';

/** Connect / disconnect Monarch for importing over MCP. */
export function SettingsMonarchSection() {
  const [status, setStatus] = useState<MonarchStatus | null>(null);
  const [busy, setBusy] = useState<'connecting' | 'disconnecting' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus(await api.getMonarchStatus());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const connect = async () => {
    setBusy('connecting');
    setError(null);
    setError(await connectMonarchAccount());
    setBusy(null);
    void reload();
  };

  const disconnect = async () => {
    setBusy('disconnecting');
    setError(null);
    try {
      await api.disconnectMonarch();
    } finally {
      setBusy(null);
      void reload();
    }
  };

  if (!status?.available) return null;

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">Monarch</h2>
      <p className="settings-section__desc">
        Import transactions from Monarch over MCP: on the Import page, pick
        Monarch Money and click Import Transactions via MCP. You review every
        row before anything is added, using the same category mappings as your
        Monarch CSV imports.
      </p>
      <div className="settings-card">
        <div className="settings-data-block">
          {status.connected ? (
            <>
              <h3 className="settings-data-block__label">Connected</h3>
              <p className="settings-data-block__text">
                Spend. only reads from Monarch, and only when you click Import
                Transactions via MCP.
              </p>
              <Button
                type="button"
                variant="ghost"
                disabled={busy != null}
                onClick={() => void disconnect()}
              >
                {busy === 'disconnecting' ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </>
          ) : (
            <>
              <h3 className="settings-data-block__label">Not connected</h3>
              <p className="settings-data-block__text">
                Sign in on monarch.com in your browser and approve read-only
                access. Spend. stores the sign-in in your macOS Keychain, never
                your password.
              </p>
              <Button
                type="button"
                variant="primary"
                disabled={busy != null}
                onClick={() => void connect()}
              >
                {busy === 'connecting'
                  ? 'Waiting for Monarch…'
                  : 'Connect Monarch'}
              </Button>
            </>
          )}
          {error ? (
            <p className="settings-modal-p settings-modal-p--warn">{error}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

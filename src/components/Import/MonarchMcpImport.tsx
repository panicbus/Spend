import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { connectMonarchAccount } from '../../utils/monarchConnect';
import { Button } from '../common/Button';

/**
 * Shown under the format picker when it is set to Monarch Money: pulls posted
 * transactions over MCP into the normal review flow, plus a link to run the
 * Monarch sign-in.
 */
export function MonarchMcpImport({ onImport }: { onImport: () => void }) {
  const [available, setAvailable] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.getMonarchStatus().then((s) => {
      if (!cancelled) setAvailable(s.available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = async () => {
    setConnecting(true);
    setMessage(null);
    const error = await connectMonarchAccount();
    setConnecting(false);
    setMessage(
      error
        ? { text: error, error: true }
        : { text: 'Monarch is connected.', error: false }
    );
  };

  if (!available) return null;

  return (
    <div className="import-mcp">
      <Button
        type="button"
        variant="primary"
        disabled={connecting}
        onClick={onImport}
      >
        Import Transactions via MCP
      </Button>
      <button
        type="button"
        className="import-mcp__link"
        disabled={connecting}
        onClick={() => void connect()}
      >
        {connecting
          ? 'Waiting for Monarch in your browser…'
          : 'MCP not connected? Click here.'}
      </button>
      {message ? (
        <p
          className={
            message.error
              ? 'import-mcp__note import-mcp__note--error'
              : 'import-mcp__note'
          }
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

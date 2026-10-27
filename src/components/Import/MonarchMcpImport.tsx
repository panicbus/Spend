import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { MonarchImportRange } from '../../../ipc-contract';
import { api } from '../../services/api';
import { connectMonarchAccount } from '../../utils/monarchConnect';
import { Button } from '../common/Button';

export const MONARCH_IMPORT_RANGES: {
  id: MonarchImportRange;
  label: string;
  /** Shown when the range holds nothing that is not already in Spend. */
  emptyNotice: string;
}[] = [
  {
    id: 'this_month',
    label: 'This month',
    emptyNotice:
      'No new Monarch transactions this month. Everything posted so far is already in Spend.',
  },
  {
    id: 'last_2_months',
    label: 'Last 2 months',
    emptyNotice:
      'No new Monarch transactions in the last 2 months. Everything posted is already in Spend.',
  },
  {
    id: 'last_3_months',
    label: 'Last 3 months',
    emptyNotice:
      'No new Monarch transactions in the last 3 months. Everything posted is already in Spend.',
  },
  {
    id: 'all_time',
    label: 'All time',
    emptyNotice:
      'No new Monarch transactions. Everything in Monarch is already in Spend.',
  },
];

function ChevronDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/**
 * Shown under the format picker when it is set to Monarch Money: pulls posted
 * transactions over MCP into the normal review flow, plus a link to run the
 * Monarch sign-in. The button imports this month; the arrow picks a longer range.
 */
export function MonarchMcpImport({
  onImport,
  notice,
}: {
  onImport: (range: MonarchImportRange) => void;
  /** Outcome of the last import attempt, e.g. nothing new in the range. */
  notice?: string | null;
}) {
  const [available, setAvailable] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    void api.getMonarchStatus().then((s) => {
      if (!cancelled) setAvailable(s.available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector('button')?.focus();
    const onPointerDown = (e: MouseEvent) => {
      if (!splitRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  const onMenuKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setMenuOpen(false);
      toggleRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll('button') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[(i + step + items.length) % items.length]?.focus();
  };

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
      <div className="import-mcp__split" ref={splitRef}>
        <Button
          type="button"
          variant="primary"
          className="import-mcp__main"
          disabled={connecting}
          onClick={() => onImport('this_month')}
        >
          Import Transactions via MCP
        </Button>
        {/* Plain <button> for the ref; Button does not forward one. */}
        <button
          ref={toggleRef}
          type="button"
          className="btn btn--primary import-mcp__toggle"
          aria-label="Choose how far back to import"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={connecting}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ChevronDown />
        </button>
        {menuOpen ? (
          <ul
            ref={menuRef}
            className="import-mcp__menu"
            role="menu"
            aria-label="Import range"
            onKeyDown={onMenuKeyDown}
          >
            {MONARCH_IMPORT_RANGES.map((r) => (
              <li key={r.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="import-mcp__menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onImport(r.id);
                  }}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
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
      ) : notice ? (
        <p className="import-mcp__note" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

import { useState } from 'react';
import type { DuplicatePair, DuplicateRow } from '../../types/import';
import { useDuplicateCleanup } from '../../hooks/useDuplicateCleanup';
import { formatCurrency } from '../../services/formatters';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

function reasonLabel(pair: DuplicatePair): string {
  switch (pair.reason) {
    case 'hash':
      return 'Identical import';
    case 'same_day':
      return 'Same day, same amount';
    case 'near_day':
      return 'A few days apart';
    default:
      return 'Same file';
  }
}

function RowLine({ row, keeper }: { row: DuplicateRow; keeper?: boolean }) {
  return (
    <span
      className={
        keeper
          ? 'settings-dupe__line settings-dupe__line--keep'
          : 'settings-dupe__line'
      }
    >
      <span className="settings-dupe__role">{keeper ? 'Keep' : 'Remove'}</span>
      <span className="settings-dupe__date">{row.date}</span>
      <span className="settings-dupe__merchant" title={row.merchant}>
        {row.merchant || '—'}
      </span>
      <span className="settings-dupe__label">{row.label || '—'}</span>
      <span className="settings-dupe__amt">
        {formatCurrency(row.amountCents)}
      </span>
    </span>
  );
}

export function SettingsDuplicatesSection() {
  const {
    state,
    pairs,
    scan,
    toggle,
    selectAllCertain,
    selectNone,
    isSelected,
    selectedCount,
    selectedTotalCents,
    deleteSelected,
  } = useDuplicateCleanup();
  const [confirming, setConfirming] = useState(false);

  const busy = state.kind === 'scanning' || state.kind === 'deleting';
  const certainCount = pairs.filter((p) => p.verdict === 'duplicate').length;
  const possibleCount = pairs.length - certainCount;

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">Duplicate transactions</h2>
      <p className="settings-section__desc">
        Find charges that landed twice — usually from importing overlapping
        exports before duplicate matching improved. The older copy is kept.
      </p>
      <div className="settings-card">
        <div className="settings-data-block">
          <h3 className="settings-data-block__label">Scan the ledger</h3>
          <p className="settings-data-block__text">
            Compares every transaction and income entry against the ones stored
            before it, the same way an import does. Nothing is deleted until you
            choose.
          </p>
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void scan()}
          >
            {state.kind === 'scanning' ? 'Scanning…' : 'Scan for duplicates'}
          </Button>

          {state.kind === 'error' ? (
            <p className="settings-modal-p settings-modal-p--warn" role="alert">
              {state.message}
            </p>
          ) : null}

          {state.kind === 'done' ? (
            <p className="settings-modal-p" role="status">
              Removed {state.deleted} row{state.deleted === 1 ? '' : 's'}.
              {state.remaining.length === 0
                ? ' No duplicates left.'
                : ` ${state.remaining.length} flagged row${
                    state.remaining.length === 1 ? '' : 's'
                  } still listed below.`}
            </p>
          ) : null}

          {state.kind === 'results' && pairs.length === 0 ? (
            <p className="settings-modal-p" role="status">
              No duplicates found.
            </p>
          ) : null}

          {pairs.length > 0 ? (
            <>
              <p className="settings-dupe__summary">
                {certainCount} duplicate{certainCount === 1 ? '' : 's'}
                {possibleCount > 0
                  ? ` · ${possibleCount} possible (a few days apart — check these before removing)`
                  : ''}
              </p>
              <div className="settings-dupe__bulk">
                {certainCount > 0 ? (
                  <button
                    type="button"
                    className="settings-dupe__link"
                    onClick={selectAllCertain}
                  >
                    Select all {certainCount} duplicate
                    {certainCount === 1 ? '' : 's'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="settings-dupe__link"
                  onClick={selectNone}
                >
                  Select none
                </button>
              </div>
              <ul className="settings-dupe__list">
                {pairs.map((p) => (
                  <li
                    key={`${p.remove.kind}:${p.remove.id}`}
                    className={
                      p.verdict === 'possible'
                        ? 'settings-dupe__item settings-dupe__item--maybe'
                        : 'settings-dupe__item'
                    }
                  >
                    <label className="settings-dupe__check">
                      <input
                        type="checkbox"
                        checked={isSelected(p)}
                        disabled={busy}
                        onChange={() => toggle(p)}
                        aria-label={`Remove duplicate ${p.remove.merchant} on ${p.remove.date}`}
                      />
                    </label>
                    <div className="settings-dupe__rows">
                      <RowLine row={p.remove} />
                      <RowLine row={p.keep} keeper />
                    </div>
                    <span
                      className={
                        p.verdict === 'possible'
                          ? 'settings-dupe__tag settings-dupe__tag--maybe'
                          : 'settings-dupe__tag'
                      }
                    >
                      {reasonLabel(p)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="settings-dupe__actions">
                <Button
                  type="button"
                  variant="primary"
                  disabled={busy || selectedCount === 0}
                  onClick={() => setConfirming(true)}
                >
                  {state.kind === 'deleting'
                    ? 'Removing…'
                    : `Remove ${selectedCount} selected`}
                </Button>
                {selectedCount > 0 ? (
                  <span className="settings-dupe__total">
                    {formatCurrency(selectedTotalCents)} of double-counted
                    activity
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <Modal
        title="Remove duplicates"
        isOpen={confirming}
        onClose={() => setConfirming(false)}
      >
        <p className="settings-modal-p">
          Permanently delete {selectedCount} row
          {selectedCount === 1 ? '' : 's'} — {formatCurrency(selectedTotalCents)}{' '}
          of double-counted activity. The older copy of each pair is kept. Export
          a backup first if you want a safety net.
        </p>
        <div className="settings-modal-actions">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              void (async () => {
                setConfirming(false);
                await deleteSelected();
              })()
            }
          >
            Remove {selectedCount}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

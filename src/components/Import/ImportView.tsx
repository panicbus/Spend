import React, { useCallback, useEffect, useState } from 'react';
import type { GroupWithCategories, IncomeSourceRow } from '../../../ipc-contract';
import type { MappingTargetType, ParsedRow } from '../../types/import';
import { useImport, effectiveRowTarget, reviewSelectValue } from '../../hooks/useImport';
import type { RowOverride } from '../../hooks/useImport';
import { api } from '../../services/api';
import { formatCurrency } from '../../services/formatters';
import { Button } from '../common/Button';
import './ImportView.css';

function mappingAssignmentToSelect(
  a:
    | { targetType: MappingTargetType; targetId: number | null }
    | undefined
): string {
  if (!a) return '';
  if (a.targetType === 'skip') return 'skip';
  if (a.targetType === 'income_source' && a.targetId != null) {
    return `income:${a.targetId}`;
  }
  if (a.targetType === 'category' && a.targetId != null) {
    return `cat:${a.targetId}`;
  }
  return '';
}

function CategorySelect({
  value,
  onChange,
  groups,
  incomeSources,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  groups: GroupWithCategories[];
  incomeSources: IncomeSourceRow[];
  className?: string;
}) {
  return (
    <select
      className={className ?? 'import-select'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Choose mapping…</option>
      <optgroup label="Skip">
        <option value="skip">Skip these transactions</option>
      </optgroup>
      <optgroup label="Income">
        {incomeSources.map((s) => (
          <option key={s.id} value={`income:${s.id}`}>
            {s.name}
          </option>
        ))}
      </optgroup>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.name}>
          {g.categories.map((c) => (
            <option key={c.id} value={`cat:${c.id}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function categoryColumnLabel(
  row: ParsedRow,
  override: RowOverride | undefined,
  groups: GroupWithCategories[],
  incomeSources: IncomeSourceRow[]
): string {
  const e = effectiveRowTarget(row, override);
  if (e.skip || e.targetType === 'skip') return 'Skip';
  if (e.targetType === 'income_source' && e.targetId != null) {
    return (
      incomeSources.find((i) => i.id === e.targetId)?.name ?? 'Income'
    );
  }
  if (e.targetType === 'category' && e.targetId != null) {
    for (const g of groups) {
      const c = g.categories.find((x) => x.id === e.targetId);
      if (c) return `${c.name} · ${g.name}`;
    }
  }
  return row.mapping?.targetName ?? '—';
}

function amountClass(cents: number): string {
  if (cents < 0) return 'import-review__amt import-review__amt--expense';
  if (cents > 0) return 'import-review__amt import-review__amt--income';
  return 'import-review__amt';
}

export function ImportView() {
  const {
    state,
    reset,
    pickFile,
    parseDroppedFile,
    assignMapping,
    confirmMappings,
    mappingsReady,
    overrideRow,
    setRowSkip,
    commit,
  } = useImport();

  const [groups, setGroups] = useState<GroupWithCategories[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSourceRow[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [g, inc] = await Promise.all([
          api.getGroups(),
          api.getIncomeSources(),
        ]);
        if (!cancelled) {
          setGroups(g ?? []);
          setIncomeSources(inc ?? []);
        }
      } catch {
        if (!cancelled) {
          setGroups([]);
          setIncomeSources([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      try {
        const p = api.getPathForFile(file);
        void parseDroppedFile(p);
      } catch {
        /* invalid file in some environments */
      }
    },
    [parseDroppedFile]
  );

  return (
    <div className="import-view">
      <header className="import-view__header">
        <h1 className="import-view__title">Import</h1>
        <p className="import-view__subtitle">
          Monarch CSV → Spend. (local, private)
        </p>
      </header>

      {state.kind === 'idle' && (
        <div className="import-card">
          <div
            className={`import-drop${dragOver ? ' import-drop--active' : ''}`}
            onDragEnter={onDragOver}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <p className="import-drop__text">
              Export your transactions from Monarch as CSV, then drop it here.
            </p>
            <Button type="button" variant="dashed" onClick={() => void pickFile()}>
              Choose CSV file
            </Button>
          </div>
        </div>
      )}

      {state.kind === 'parsing' && (
        <div className="import-card import-card--muted">
          <p className="import-status">Reading CSV…</p>
        </div>
      )}

      {state.kind === 'mapping' && (
        <div className="import-card">
          <h2 className="import-card__title">Map Monarch categories to Spend.</h2>
          <p className="import-card__sub">
            We&apos;ll remember these for next time.
          </p>
          <ul className="import-map-list">
            {state.unknownCategories.map((name) => {
              const count = state.rows.filter(
                (r) => r.externalCategory === name
              ).length;
              const label = name || '(Uncategorized)';
              return (
                <li key={name || '__empty__'} className="import-map-item">
                  <div className="import-map-item__left">
                    <span className="import-map-item__name">{label}</span>
                    <span className="import-map-item__badge">
                      {count} transactions
                    </span>
                  </div>
                  <CategorySelect
                    className="import-select import-map-item__select"
                    value={mappingAssignmentToSelect(state.assignments[name])}
                    onChange={(v) => assignMapping(name, v)}
                    groups={groups}
                    incomeSources={incomeSources}
                  />
                </li>
              );
            })}
          </ul>
          <div className="import-actions">
            <Button
              type="button"
              variant="primary"
              disabled={!mappingsReady}
              onClick={() => void confirmMappings()}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {state.kind === 'reviewing' && (
        <div className="import-card import-card--wide">
          <h2 className="import-card__title">
            Review {state.rows.length} transactions
          </h2>
          <ReviewSummary
            rows={state.rows}
            rowOverrides={state.rowOverrides}
          />
          <div className="import-review__table-wrap">
            <div className="import-review__thead">
              <span>Date</span>
              <span>Merchant</span>
              <span>Category</span>
              <span className="import-review__thead-amt">Amount</span>
              <span>Skip</span>
            </div>
            <div className="import-review__body">
              {state.rows.map((row, idx) => (
                <div
                  key={`${row.importHash}-${idx}`}
                  className={`import-review__row${idx % 2 === 1 ? ' import-review__row--alt' : ''}`}
                >
                  <span className="import-review__cell">{row.date}</span>
                  <span
                    className="import-review__cell import-review__cell--merchant"
                    title={row.merchant}
                  >
                    {row.merchant}
                  </span>
                  <span className="import-review__cell import-review__cell--cat">
                    <span className="import-review__cat-label">
                      {categoryColumnLabel(
                        row,
                        state.rowOverrides[row.rowIndex],
                        groups,
                        incomeSources
                      )}
                    </span>
                    <CategorySelect
                      className="import-select import-select--compact"
                      value={reviewSelectValue(row, state.rowOverrides)}
                      onChange={(v) => overrideRow(row.rowIndex, v)}
                      groups={groups}
                      incomeSources={incomeSources}
                    />
                  </span>
                  <span
                    className={`import-review__cell import-review__cell--amt ${amountClass(row.amountCents)}`}
                  >
                    {formatCurrency(row.amountCents)}
                  </span>
                  <label className="import-review__cell import-review__skip">
                    <input
                      type="checkbox"
                      checked={
                        effectiveRowTarget(
                          row,
                          state.rowOverrides[row.rowIndex]
                        ).skip
                      }
                      onChange={(e) =>
                        setRowSkip(row.rowIndex, e.target.checked)
                      }
                      aria-label={`Skip row ${idx + 1}`}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="import-actions">
            <Button type="button" variant="primary" onClick={() => void commit()}>
              Import
            </Button>
          </div>
        </div>
      )}

      {state.kind === 'committing' && (
        <div className="import-card import-card--muted">
          <p className="import-status">Importing…</p>
        </div>
      )}

      {state.kind === 'done' && (
        <div className="import-card">
          <h2 className="import-card__title">Import complete</h2>
          <p className="import-done__text">
            Imported {state.result.imported}, skipped {state.result.skipped},
            found {state.result.duplicates} duplicates
          </p>
          <Button type="button" variant="primary" onClick={reset}>
            Import another file
          </Button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="import-card import-card--error">
          <h2 className="import-card__title">Something went wrong</h2>
          <p className="import-error__text">{state.message}</p>
          <Button type="button" variant="primary" onClick={reset}>
            Start over
          </Button>
        </div>
      )}
    </div>
  );
}

function ReviewSummary({
  rows,
  rowOverrides,
}: {
  rows: ParsedRow[];
  rowOverrides: Record<number, RowOverride>;
}) {
  let expN = 0;
  let expSum = 0;
  let incN = 0;
  let incSum = 0;
  let skipN = 0;
  for (const r of rows) {
    const e = effectiveRowTarget(r, rowOverrides[r.rowIndex]);
    if (e.skip || e.targetType === 'skip') {
      skipN++;
      continue;
    }
    if (e.targetType === 'income_source') {
      incN++;
      incSum += r.amountCents;
    } else if (e.targetType === 'category') {
      expN++;
      expSum += -r.amountCents;
    }
  }
  return (
    <p className="import-review__summary">
      {expN} expenses ({formatCurrency(expSum)}) · {incN} income items (
      {formatCurrency(incSum)}) · {skipN} skipped
    </p>
  );
}

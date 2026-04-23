import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GroupWithCategories, IncomeSourceRow } from '../../../ipc-contract';
import type { ParsedRow } from '../../types/import';
import {
  useImport,
  effectiveRowTarget,
  reviewSelectValue,
} from '../../hooks/useImport';
import type { RowOverride } from '../../hooks/useImport';
import { api } from '../../services/api';
import { DATA_CHANGED_EVENT } from '../../utils/dataChanged';
import { formatCurrency } from '../../services/formatters';
import { Button } from '../common/Button';
import { ImportCreateCategoryForm } from './ImportCreateCategoryForm';
import { MappingTargetSelect } from '../common/MappingTargetSelect';
import { mappingAssignmentToSelectValue } from '../../utils/mappingSelectValue';
import { formatImportFileDateRange } from '../../utils/importDateRange';
import { currentMonthKey, formatMonthLabel } from '../../utils/dates';
import type { CommitImportResult } from '../../types/import';
import './ImportView.css';

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
    setAssignmentDirect,
    confirmMappings,
    mappingsReady,
    overrideRow,
    setRowSkip,
    requestImport,
    confirmImportDespiteDuplicates,
    cancelDuplicateWarning,
  } = useImport();

  const [groups, setGroups] = useState<GroupWithCategories[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSourceRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [creatingMapExternal, setCreatingMapExternal] = useState<string | null>(
    null
  );
  const [creatingReviewKey, setCreatingReviewKey] = useState<string | null>(
    null
  );

  const groupsSorted = useMemo(
    () =>
      [...groups].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      ),
    [groups]
  );

  const refreshGroups = useCallback(async () => {
    const g = await api.getGroups();
    setGroups(g ?? []);
  }, []);

  useEffect(() => {
    const onData = () => {
      void (async () => {
        try {
          const [g, inc] = await Promise.all([
            api.getGroups(),
            api.getIncomeSources(),
          ]);
          setGroups(g ?? []);
          setIncomeSources(inc ?? []);
        } catch {
          setGroups([]);
          setIncomeSources([]);
        }
      })();
    };
    window.addEventListener(DATA_CHANGED_EVENT, onData);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onData);
  }, []);

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
          <div className="import-card__head import-card__head--status">
            <p className="import-status">Reading CSV…</p>
            <Button
              type="button"
              variant="ghost"
              className="import-btn-cancel"
              onClick={reset}
            >
              Cancel import
            </Button>
          </div>
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
              const isCreating = creatingMapExternal === name;
              return (
                <li key={name || '__empty__'} className="import-map-item">
                  <div className="import-map-item__left">
                    <span className="import-map-item__name">{label}</span>
                    <span className="import-map-item__badge">
                      {count} transactions
                    </span>
                  </div>
                  {isCreating ? (
                    <ImportCreateCategoryForm
                      groupsSorted={groupsSorted}
                      onCancel={() => setCreatingMapExternal(null)}
                      onSubmitSuccess={async (categoryId) => {
                        await api.saveCategoryMapping({
                          externalName: name,
                          targetType: 'category',
                          targetId: categoryId,
                        });
                        await refreshGroups();
                        setAssignmentDirect(name, {
                          targetType: 'category',
                          targetId: categoryId,
                        });
                        setCreatingMapExternal(null);
                      }}
                    />
                  ) : (
                    <MappingTargetSelect
                      className="import-select import-map-item__select"
                      value={mappingAssignmentToSelectValue(state.assignments[name])}
                      onChange={(v) => {
                        if (v === '__create_category__') {
                          setCreatingMapExternal(name);
                          return;
                        }
                        assignMapping(name, v);
                      }}
                      groups={groupsSorted}
                      incomeSources={incomeSources}
                      withCreateCategory
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <div className="import-actions import-actions--spread">
            <Button
              type="button"
              variant="ghost"
              className="import-btn-cancel"
              onClick={reset}
            >
              Cancel import
            </Button>
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

      {(state.kind === 'reviewing' ||
        state.kind === 'checking_duplicates' ||
        state.kind === 'duplicate_warning') && (
        <div className="import-card import-card--wide">
          <div className="import-card__head import-card__head--review">
            <div className="import-card__head-text">
              <h2 className="import-card__title">
                Review {state.rows.length} transactions
              </h2>
              <p className="import-review__date-range">
                {formatImportFileDateRange(state.rows)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="import-btn-cancel"
              onClick={reset}
            >
              Cancel import
            </Button>
          </div>
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
              {state.rows.map((row, idx) => {
                const reviewCreateKey = `review:${row.rowIndex}`;
                const isCreatingRow = creatingReviewKey === reviewCreateKey;
                const reviewLocked =
                  state.kind === 'checking_duplicates' ||
                  state.kind === 'duplicate_warning';
                return (
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
                      {isCreatingRow ? (
                        <ImportCreateCategoryForm
                          groupsSorted={groupsSorted}
                          onCancel={() => setCreatingReviewKey(null)}
                          onSubmitSuccess={async (categoryId) => {
                            await api.saveCategoryMapping({
                              externalName: row.externalCategory,
                              targetType: 'category',
                              targetId: categoryId,
                            });
                            await refreshGroups();
                            overrideRow(row.rowIndex, `cat:${categoryId}`);
                            setCreatingReviewKey(null);
                          }}
                        />
                      ) : (
                        <MappingTargetSelect
                          className="import-select import-select--compact"
                          value={reviewSelectValue(row, state.rowOverrides)}
                          onChange={(v) => {
                            if (v === '__create_category__') {
                              setCreatingReviewKey(reviewCreateKey);
                              return;
                            }
                            overrideRow(row.rowIndex, v);
                          }}
                          groups={groupsSorted}
                          incomeSources={incomeSources}
                          withCreateCategory
                          disabled={reviewLocked}
                        />
                      )}
                    </span>
                  <span
                    className={`import-review__cell import-review__cell--amt ${amountClass(row.amountCents)}`}
                  >
                    {formatCurrency(row.amountCents)}
                  </span>
                  <label className="import-review__cell import-review__skip">
                    <input
                      type="checkbox"
                      disabled={reviewLocked}
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
                );
              })}
            </div>
          </div>
          <div className="import-actions import-actions--review">
            {state.kind === 'reviewing' && (
              <Button
                type="button"
                variant="primary"
                onClick={() => void requestImport()}
              >
                Import
              </Button>
            )}
            {state.kind === 'checking_duplicates' && (
              <p className="import-review__checking" role="status">
                Checking for duplicates…
              </p>
            )}
            {state.kind === 'duplicate_warning' && (
              <div className="import-duplicate-panel">
                <p className="import-duplicate-panel__lead">
                  {state.newCount === 0
                    ? `${state.duplicateCount} of ${state.importCandidateCount} rows already exist in your database — nothing new to import.`
                    : `${state.duplicateCount} of ${state.importCandidateCount} rows already exist in your database.`}
                </p>
                {state.newCount > 0 ? (
                  <p className="import-duplicate-panel__sub">
                    Only {state.newCount} new transaction
                    {state.newCount === 1 ? '' : 's'} will be imported.
                  </p>
                ) : null}
                <div
                  className={
                    state.newCount === 0
                      ? 'import-duplicate-panel__btns import-duplicate-panel__btns--end'
                      : 'import-duplicate-panel__btns import-duplicate-panel__btns--split'
                  }
                >
                  {state.newCount > 0 ? (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => void confirmImportDespiteDuplicates()}
                    >
                      Import {state.newCount} new
                    </Button>
                  ) : null}
                  <div className="import-duplicate-panel__btns-right">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={cancelDuplicateWarning}
                    >
                      Back to review
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="import-btn-cancel"
                      onClick={reset}
                    >
                      Cancel import
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {state.kind === 'committing' && (
        <div className="import-card import-card--muted">
          <p className="import-status">Importing…</p>
        </div>
      )}

      {state.kind === 'done' && (
        <div className="import-card import-card--done">
          <h2 className="import-card__title">Import complete</h2>
          <ImportDoneBody
            result={state.result}
            monthSpendingTotal={state.monthSpendingTotal}
          />
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

function ImportDoneBody({
  result,
  monthSpendingTotal,
}: {
  result: CommitImportResult;
  monthSpendingTotal: number | null;
}) {
  const curKey = currentMonthKey();
  const staleNote =
    result.staleTargets > 0
      ? ` (${result.staleTargets} had a removed category or income source)`
      : '';

  const expenseMonths = Object.entries(result.addedExpenseCentsByMonth)
    .filter(([, cents]) => cents > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const showMonthSplit = expenseMonths.length > 1;

  if (result.imported === 0) {
    return (
      <p className="import-done__text">
        No transactions imported — all rows were skipped or duplicates.
        {result.staleTargets > 0
          ? ` (${result.staleTargets} could not be applied because a category or income source was removed.)`
          : ''}
      </p>
    );
  }

  return (
    <>
      <p className="import-done__text">
        Imported {result.imported} transaction
        {result.imported === 1 ? '' : 's'}, skipped {result.skipped},{' '}
        {result.duplicates} duplicate
        {result.duplicates === 1 ? '' : 's'}
        {staleNote}.
      </p>
      <div className="import-done__details">
        {result.addedExpenseCents > 0 ? (
          <p className="import-done__detail">
            Added {formatCurrency(result.addedExpenseCents)} in expenses across{' '}
            {result.addedExpenseCategoryCount} categor
            {result.addedExpenseCategoryCount === 1 ? 'y' : 'ies'}.
          </p>
        ) : null}
        {result.addedIncomeCents > 0 ? (
          <p className="import-done__detail">
            Added {formatCurrency(result.addedIncomeCents)} in income from{' '}
            {result.addedIncomeSourceCount} source
            {result.addedIncomeSourceCount === 1 ? '' : 's'}.
          </p>
        ) : null}
        {showMonthSplit ? (
          <p className="import-done__detail import-done__detail--months">
            {expenseMonths.map(([mk, cents], i) => (
              <span key={mk}>
                {i > 0 ? ' · ' : ''}
                {formatMonthLabel(mk)}: {formatCurrency(cents)}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      {monthSpendingTotal != null &&
      (result.addedExpenseCentsByMonth[curKey] ?? 0) > 0 ? (
        <p className="import-done__callout">
          Your {formatMonthLabel(curKey)} spending is now{' '}
          {formatCurrency(monthSpendingTotal)}.
        </p>
      ) : null}
    </>
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GroupWithCategories, IncomeSourceRow } from '../../../ipc-contract';
import type { ParsedRow } from '../../types/import';
import {
  useImport,
  effectiveRowTarget,
  reviewSelectValue,
} from '../../hooks/useImport';
import type { RowOverride } from '../../hooks/useImport';
import {
  GENERIC_PROFILE_ID,
  getCSVProfile,
  importFormatSelectGroups,
} from '../../utils/csv-profiles';
import { ImportColumnMapping } from './ImportColumnMapping';
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

type ImportViewProps = {
  /** Hide page header; for first-run wizard embed. */
  embedded?: boolean;
  onImportDone?: (result: CommitImportResult) => void;
};

export function ImportView({ embedded, onImportDone }: ImportViewProps = {}) {
  const {
    state,
    profileId,
    setProfileId,
    reset,
    pickFile,
    parseDroppedFile,
    updateColumnMappingDraft,
    confirmColumnMapping,
    columnMappingReady,
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
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const [dropError, setDropError] = useState<string | null>(null);
  const [creatingMapExternal, setCreatingMapExternal] = useState<string | null>(
    null
  );
  const [creatingReviewKey, setCreatingReviewKey] = useState<string | null>(
    null
  );

  const formatGroups = useMemo(() => importFormatSelectGroups(), []);
  const genericProfile = useMemo(() => getCSVProfile(GENERIC_PROFILE_ID), []);

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

  const dataTransferHasFiles = useCallback((dt: DataTransfer) => {
    if (dt.types.includes('Files')) return true;
    return Array.from(dt.types).some((t) => t === 'Files');
  }, []);

  useEffect(() => {
    if (!dropError) return;
    const t = window.setTimeout(() => setDropError(null), 3000);
    const dismiss = () => setDropError(null);
    window.addEventListener('mousedown', dismiss);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('mousedown', dismiss);
    };
  }, [dropError]);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      dragDepthRef.current += 1;
      setDragOver(true);
    },
    [dataTransferHasFiles]
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (dataTransferHasFiles(e.dataTransfer)) {
        e.dataTransfer.dropEffect = 'copy';
      }
    },
    [dataTransferHasFiles]
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      const rel = e.relatedTarget as Node | null;
      if (
        rel &&
        dropZoneRef.current &&
        dropZoneRef.current.contains(rel)
      ) {
        return;
      }
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setDragOver(false);
      }
    },
    [dataTransferHasFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setDragOver(false);
      if (!dataTransferHasFiles(e.dataTransfer)) return;
      const list = e.dataTransfer.files;
      if (!list || list.length === 0) return;
      if (list.length > 1) {
        setDropError('Please drop one file at a time');
        return;
      }
      const file = list[0];
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setDropError('Only CSV files are supported');
        return;
      }
      try {
        const p = api.getPathForFile(file);
        void parseDroppedFile(p);
      } catch {
        /* invalid file in some environments */
      }
    },
    [dataTransferHasFiles, parseDroppedFile]
  );

  useEffect(() => {
    if (state.kind === 'done' && onImportDone) {
      onImportDone(state.result);
    }
  }, [state, onImportDone]);

  const mappingSource =
    state.kind === 'mapping'
      ? state.profileId
      : state.kind === 'reviewing' ||
          state.kind === 'checking_duplicates' ||
          state.kind === 'duplicate_warning'
        ? state.profileId
        : profileId;

  return (
    <div className={embedded ? 'import-view import-view--embedded' : 'import-view'}>
      {!embedded && (
        <header className="import-view__header">
          <h1 className="import-view__title">Import</h1>
          <p className="import-view__subtitle">
            CSV → Spend. (local, private)
          </p>
        </header>
      )}

      {(state.kind === 'idle' || state.kind === 'error' || state.kind === 'done') && (
        <div className="import-format-select-wrap">
          <label className="import-format-select__label" htmlFor="import-format">
            What format is your CSV?
          </label>
          <select
            id="import-format"
            className="import-select import-format-select"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            {formatGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
            {genericProfile ? (
              <option value={genericProfile.id}>{genericProfile.name}</option>
            ) : null}
          </select>
          <p className="import-format-select__hint">
            Not sure? Check your bank&apos;s website for CSV export instructions.
          </p>
        </div>
      )}

      {state.kind === 'idle' && (
        <div
          ref={dropZoneRef}
          className={
            dragOver
              ? 'import-card import-card--drop-zone import-card--drop-zone-active'
              : 'import-card import-card--drop-zone'
          }
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="import-drop">
            <svg
              className="import-drop__icon"
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <div className="import-drop__copy">
              {dragOver ? (
                <p className="import-drop__text import-drop__text--emph">
                  Drop to import
                </p>
              ) : (
                <>
                  <p className="import-drop__text">
                    Drag a CSV here
                  </p>
                  <span className="import-drop__or">or</span>
                </>
              )}
            </div>
            <Button type="button" variant="dashed" onClick={() => void pickFile()}>
              Choose CSV file
            </Button>
            {dropError ? (
              <p className="import-drop__error" role="alert">
                {dropError}
              </p>
            ) : null}
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

      {state.kind === 'column_mapping' && (
        <div className="import-card">
          <h2 className="import-card__title">Map CSV columns</h2>
          <p className="import-card__sub">
            Tell Spend. which columns hold the date, merchant, and amount.
          </p>
          <ImportColumnMapping
            headers={state.headers}
            draft={state.draft}
            onChange={updateColumnMappingDraft}
            onConfirm={() => void confirmColumnMapping()}
            onCancel={reset}
            ready={columnMappingReady}
          />
        </div>
      )}

      {state.kind === 'mapping' && (
        <div className="import-card">
          <h2 className="import-card__title">Map categories to Spend.</h2>
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
                          source: mappingSource,
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
                              source: mappingSource,
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

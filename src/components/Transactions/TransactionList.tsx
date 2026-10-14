import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import type { MergedTransactionRow } from '../../hooks/useTransactionList';
import { useTransactionList } from '../../hooks/useTransactionList';
import {
  canGoToPreviousDataMonth,
  formatMonthLabel,
  formatMonthRangeLabel,
  shiftMonthKey,
} from '../../utils/dates';
import { api } from '../../services/api';
import { formatCurrency } from '../../services/formatters';
import { Button } from '../common/Button';
import { ReturnToCurrentMonthButton } from '../common/ReturnToCurrentMonthButton';
import type {
  GroupWithCategories,
  IncomeSourceRow,
} from '../../../ipc-contract';
import type { BudgetReturnContext } from '../../utils/budgetReturnContext';
import {
  clearBudgetReturnContext,
  readBudgetReturnContext,
  setBudgetReturnContext,
} from '../../utils/budgetReturnContext';
import type { TrendsReturnContext } from '../../utils/trendsReturnContext';
import {
  clearTrendsReturnContext,
  readTrendsReturnContext,
  setTrendsReturnContext,
} from '../../utils/trendsReturnContext';
import { MerchantInsightsCard } from './MerchantInsightsCard';
import { resolveMerchantForInsights } from '../../utils/merchantInsightEligible';
import './TransactionList.css';

function formatDisplayDate(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Import timestamp shown as calendar date only (no time or source label). */
function formatImportedDateOnly(iso: string) {
  const dayPart = iso.includes('T') ? iso.split('T')[0]! : iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayPart)) {
    return formatDisplayDate(dayPart);
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return formatDisplayDate(`${y}-${m}-${d}`);
}

function TransactionNoteBadge({ note }: { note: string }) {
  const tipId = useId();
  return (
    <span
      className="transaction-list__note-wrap"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="transaction-list__note-badge" aria-describedby={tipId}>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span
        id={tipId}
        className="transaction-list__note-tooltip"
        role="tooltip"
      >
        {note}
      </span>
    </span>
  );
}

export function TransactionList() {
  useEffect(() => {
    void api.setPreferences({ viewedTransactions: true });
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const returnToTrends: TrendsReturnContext | null =
    (location.state as { trendsReturn?: TrendsReturnContext } | null)
      ?.trendsReturn ?? readTrendsReturnContext();
  const returnToBudget: BudgetReturnContext | null =
    (location.state as { budgetReturn?: BudgetReturnContext } | null)
      ?.budgetReturn ?? readBudgetReturnContext();
  const {
    data,
    mergedRows,
    loading,
    refreshing,
    error,
    monthKey,
    setMonthKey,
    categoryIds,
    setCategoryIds,
    incomeOnlySourceIds,
    setIncomeOnlySourceIds,
    incomeLineLabel,
    setIncomeLineLabel,
    dateRange,
    setDateRange,
    searchText,
    setSearchText,
    debouncedSearch,
    groups,
    incomeSources,
    updateRowCategory,
    createCategoryForRow,
    updateIncomeRowSource,
    removeRow,
    removeIncomeRow,
  } = useTransactionList();

  useLayoutEffect(() => {
    const rf = searchParams.get('rangeFrom');
    const rt = searchParams.get('rangeTo');
    const cat = searchParams.get('category');
    const catsRaw = searchParams.get('categories');
    const incomeSource = searchParams.get('incomeSource');
    const incomeSourcesRaw = searchParams.get('incomeSources');
    const incomeLine = searchParams.get('incomeLine');
    const search = searchParams.get('search');
    let next = false;
    if (
      rf &&
      rt &&
      /^\d{4}-\d{2}$/.test(rf) &&
      /^\d{4}-\d{2}$/.test(rt) &&
      rf <= rt
    ) {
      setDateRange({ startMonthKey: rf, endMonthKey: rt });
      setMonthKey(rt);
      next = true;
    }
    let appliedCategoryIds = false;
    if (catsRaw != null && catsRaw !== '') {
      const ids = catsRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
        .map(Number);
      if (ids.length > 0) {
        setCategoryIds(ids);
        setIncomeOnlySourceIds(undefined);
        setIncomeLineLabel(undefined);
        appliedCategoryIds = true;
        next = true;
      }
    }
    if (!appliedCategoryIds && cat && /^\d+$/.test(cat)) {
      setCategoryIds([Number(cat)]);
      setIncomeOnlySourceIds(undefined);
      setIncomeLineLabel(undefined);
      next = true;
    }
    let appliedIncomeSourceIds = false;
    if (incomeSourcesRaw != null && incomeSourcesRaw !== '') {
      const ids = incomeSourcesRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
        .map(Number);
      if (ids.length > 0) {
        setIncomeOnlySourceIds(ids);
        setIncomeLineLabel(undefined);
        setCategoryIds(undefined);
        appliedIncomeSourceIds = true;
        next = true;
      }
    }
    if (!appliedIncomeSourceIds && incomeSource && /^\d+$/.test(incomeSource)) {
      setIncomeOnlySourceIds([Number(incomeSource)]);
      setIncomeLineLabel(
        incomeLine != null && incomeLine !== '' ? incomeLine : undefined
      );
      setCategoryIds(undefined);
      next = true;
    }
    if (search != null && search !== '') {
      setSearchText(search);
      next = true;
    }
    if (next) {
      const p = new URLSearchParams(searchParams);
      p.delete('rangeFrom');
      p.delete('rangeTo');
      p.delete('category');
      p.delete('categories');
      p.delete('incomeSource');
      p.delete('incomeSources');
      p.delete('incomeLine');
      p.delete('search');
      /** Keep router state (e.g. trendsReturn); default setSearchParams drops it. */
      setSearchParams(p, { replace: true, state: location.state });
    }
  }, [
    searchParams,
    setSearchParams,
    setDateRange,
    setMonthKey,
    setCategoryIds,
    setIncomeOnlySourceIds,
    setIncomeLineLabel,
    setSearchText,
    location.state,
  ]);

  useLayoutEffect(() => {
    const trendSt = (
      location.state as { trendsReturn?: TrendsReturnContext } | null
    )?.trendsReturn;
    const budgetSt = (
      location.state as { budgetReturn?: BudgetReturnContext } | null
    )?.budgetReturn;
    if (trendSt) {
      setTrendsReturnContext(trendSt);
      clearBudgetReturnContext();
      return;
    }
    if (budgetSt) {
      setBudgetReturnContext(budgetSt);
      clearTrendsReturnContext();
      return;
    }
    const fromListDeepLink =
      searchParams.has('rangeFrom') ||
      searchParams.has('rangeTo') ||
      searchParams.has('category') ||
      searchParams.has('categories') ||
      searchParams.has('incomeSource') ||
      searchParams.has('incomeSources') ||
      searchParams.has('incomeLine') ||
      searchParams.has('search');
    if (!fromListDeepLink) {
      clearTrendsReturnContext();
      clearBudgetReturnContext();
    }
  }, [location.state, searchParams]);

  useEffect(() => {
    if (categoryIds !== undefined) {
      setIncomeOnlySourceIds(undefined);
      setIncomeLineLabel(undefined);
    }
  }, [categoryIds, setIncomeOnlySourceIds, setIncomeLineLabel]);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [savedForId, setSavedForId] = useState<number | null>(null);
  const savedTimerRef = useRef<number | null>(null);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const catMenuRef = useRef<HTMLDivElement | null>(null);
  const catBtnRef = useRef<HTMLButtonElement | null>(null);
  const masterCatRef = useRef<HTMLInputElement | null>(null);
  const groupHeaderCheckboxRefs = useRef<Map<number, HTMLInputElement>>(
    new Map()
  );

  const allCategoryIds = useMemo(
    () => groups.flatMap((g) => g.categories.map((c) => c.id)),
    [groups]
  );

  const isCategoryChecked = useCallback(
    (id: number) => {
      if (categoryIds === undefined) return true;
      return categoryIds.includes(id);
    },
    [categoryIds]
  );

  const toggleCategoryFilter = useCallback(
    (id: number) => {
      if (categoryIds !== undefined && categoryIds.length === 0) {
        setCategoryIds([id]);
        return;
      }
      if (categoryIds === undefined) {
        const next = allCategoryIds.filter((x) => x !== id);
        if (next.length === 0 || next.length === allCategoryIds.length) {
          setCategoryIds(undefined);
        } else {
          setCategoryIds(next);
        }
        return;
      }
      let next: number[];
      if (categoryIds.includes(id)) {
        next = categoryIds.filter((x) => x !== id);
      } else {
        next = [...categoryIds, id];
      }
      if (next.length === 0 || next.length === allCategoryIds.length) {
        setCategoryIds(undefined);
      } else {
        setCategoryIds(next);
      }
    },
    [allCategoryIds, categoryIds, setCategoryIds]
  );

  const clearCategoryFilter = useCallback(() => {
    setCategoryIds(undefined);
    setIncomeOnlySourceIds(undefined);
    setIncomeLineLabel(undefined);
  }, [setCategoryIds, setIncomeOnlySourceIds, setIncomeLineLabel]);

  const groupChipState = useCallback(
    (g: GroupWithCategories): 'all' | 'some' | 'none' => {
      const gIds = g.categories.map((c) => c.id);
      if (gIds.length === 0) return 'none';
      if (categoryIds === undefined) return 'all';
      if (categoryIds.length === 0) return 'none';
      const n = gIds.filter((id) => categoryIds.includes(id)).length;
      if (n === 0) return 'none';
      if (n === gIds.length) return 'all';
      return 'some';
    },
    [categoryIds]
  );

  const onGroupFilterChange = useCallback(
    (g: GroupWithCategories, checked: boolean) => {
      const gIds = g.categories.map((c) => c.id);
      if (gIds.length === 0) return;

      if (checked) {
        if (categoryIds === undefined) return;
        if (categoryIds.length === 0) {
          setCategoryIds([...gIds]);
          return;
        }
        const next = [...new Set([...categoryIds, ...gIds])];
        if (next.length === allCategoryIds.length) setCategoryIds(undefined);
        else setCategoryIds(next);
        return;
      }

      if (categoryIds === undefined) {
        const next = allCategoryIds.filter((id) => !gIds.includes(id));
        setCategoryIds(next.length === 0 ? [] : next);
        return;
      }
      if (categoryIds.length === 0) return;
      const next = categoryIds.filter((id) => !gIds.includes(id));
      if (next.length === 0) setCategoryIds(undefined);
      else setCategoryIds(next);
    },
    [allCategoryIds, categoryIds, setCategoryIds]
  );

  useLayoutEffect(() => {
    if (!catMenuOpen) return;
    for (const g of groups) {
      const el = groupHeaderCheckboxRefs.current.get(g.id);
      if (!el) continue;
      el.indeterminate = groupChipState(g) === 'some';
    }
  }, [catMenuOpen, groups, categoryIds, groupChipState]);

  useEffect(() => {
    const el = masterCatRef.current;
    if (!el) return;
    el.indeterminate =
      categoryIds !== undefined &&
      categoryIds.length > 0 &&
      categoryIds.length < allCategoryIds.length;
  }, [categoryIds, allCategoryIds.length]);

  useEffect(() => {
    setExpandedKey(null);
  }, [
    monthKey,
    categoryIds,
    debouncedSearch,
    dateRange,
    incomeOnlySourceIds,
    incomeLineLabel,
  ]);

  const exitDateRange = useCallback(() => {
    setDateRange(null);
  }, [setDateRange]);

  useEffect(() => {
    if (!catMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (catMenuRef.current?.contains(t) || catBtnRef.current?.contains(t)) {
        return;
      }
      setCatMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [catMenuOpen]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current != null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const hasIncomeDrill =
    !!incomeOnlySourceIds && incomeOnlySourceIds.length > 0;
  const noFilters =
    debouncedSearch.trim() === '' &&
    categoryIds === undefined &&
    !hasIncomeDrill;
  const isEmpty =
    !loading && !error && data !== null && data.totals.count === 0;
  const emptyMonth = isEmpty && noFilters;
  const emptyFiltered = isEmpty && !noFilters;

  const insightMerchant = useMemo(
    () => resolveMerchantForInsights(mergedRows, debouncedSearch),
    [mergedRows, debouncedSearch]
  );

  const flashSaved = useCallback((id: number) => {
    if (savedTimerRef.current != null) {
      window.clearTimeout(savedTimerRef.current);
    }
    setSavedForId(id);
    savedTimerRef.current = window.setTimeout(() => {
      setSavedForId((cur) => (cur === id ? null : cur));
      savedTimerRef.current = null;
    }, 1500);
  }, []);

  const onRecatChange = useCallback(
    async (txId: number, nextCat: number) => {
      try {
        await updateRowCategory(txId, nextCat);
        flashSaved(txId);
      } catch {
        /* optimistic revert handled in hook */
      }
    },
    [updateRowCategory, flashSaved]
  );

  /** Errors propagate so the inline form can show them and stay open. */
  const onCreateCategory = useCallback(
    async (txId: number, groupId: number, name: string) => {
      await createCategoryForRow(txId, groupId, name);
      flashSaved(txId);
    },
    [createCategoryForRow, flashSaved]
  );

  const onIncomeSourceChange = useCallback(
    async (incomeId: number, sourceId: number) => {
      try {
        await updateIncomeRowSource(incomeId, sourceId);
        flashSaved(-incomeId);
      } catch {
        /* optimistic revert handled in hook */
      }
    },
    [updateIncomeRowSource, flashSaved]
  );

  const filterButtonLabel = hasIncomeDrill
    ? incomeLineLabel
      ? `Income · ${incomeLineLabel}`
      : 'Income only'
    : categoryIds === undefined
      ? 'All categories'
      : categoryIds.length === 0
        ? 'No categories'
        : `${categoryIds.length} categories`;

  const netPositive = (data?.totals.netCents ?? 0) >= 0;

  return (
    <div className="transaction-list">
      <header className="transaction-list__header">
        <h1 className="transaction-list__title">Transactions</h1>
        <div className="transaction-list__month-row">
          <div className="transaction-list__month-row-spacer">
            {returnToBudget ? (
              <button
                type="button"
                className="transaction-list__back-trends"
                onClick={() => {
                  clearBudgetReturnContext();
                  navigate('/', {
                    state: { budgetRestore: returnToBudget },
                  });
                }}
              >
                ← Back to Budget
              </button>
            ) : returnToTrends ? (
              <button
                type="button"
                className="transaction-list__back-trends"
                onClick={() => {
                  if (!returnToTrends) {
                    navigate('/trends');
                    return;
                  }
                  clearTrendsReturnContext();
                  navigate('/trends', {
                    state: { trendsRestore: returnToTrends },
                  });
                }}
              >
                ← Back to Trends
              </button>
            ) : null}
          </div>
          <div className="transaction-list__month-nav">
            <button
              type="button"
              className="transaction-list__nav"
              aria-label="Previous month"
              disabled={
                dateRange !== null || !canGoToPreviousDataMonth(monthKey)
              }
              onClick={() => {
                setMonthKey(shiftMonthKey(monthKey, -1));
              }}
            >
              ‹
            </button>
            <span className="transaction-list__month-label">
              {dateRange
                ? formatMonthRangeLabel(
                    dateRange.startMonthKey,
                    dateRange.endMonthKey
                  )
                : formatMonthLabel(monthKey)}
            </span>
            <button
              type="button"
              className="transaction-list__nav"
              aria-label="Next month"
              disabled={dateRange !== null}
              onClick={() => {
                setMonthKey(shiftMonthKey(monthKey, 1));
              }}
            >
              ›
            </button>
          </div>
          {dateRange ? (
            <button
              type="button"
              className="transaction-list__exit-range"
              onClick={() => {
                exitDateRange();
                setExpandedKey(null);
              }}
            >
              Month view
            </button>
          ) : (
            <ReturnToCurrentMonthButton
              monthKey={monthKey}
              setMonthKey={setMonthKey}
              onAfterNavigate={() => setExpandedKey(null)}
            />
          )}
        </div>
      </header>

      <div className="transaction-list__filters">
        <input
          type="search"
          className="transaction-list__search"
          placeholder="Search merchant, statement, or notes"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          aria-label="Search transactions"
        />
        <div className="transaction-list__cat-filter-wrap">
          <button
            ref={catBtnRef}
            type="button"
            className="transaction-list__cat-trigger"
            aria-expanded={catMenuOpen}
            onClick={() => setCatMenuOpen((o) => !o)}
          >
            {filterButtonLabel}
          </button>
          {catMenuOpen && (
            <div ref={catMenuRef} className="transaction-list__cat-popover">
              <label className="transaction-list__cat-option transaction-list__cat-master">
                <input
                  ref={masterCatRef}
                  type="checkbox"
                  checked={categoryIds === undefined}
                  onChange={(e) => {
                    if (e.target.checked) setCategoryIds(undefined);
                    else setCategoryIds([]);
                  }}
                />
                <span className="transaction-list__cat-master-label">
                  All categories
                </span>
              </label>
              <div className="transaction-list__cat-master-rule" aria-hidden />
              {groups.map((g) => (
                <div key={g.id} className="transaction-list__cat-group">
                  <label className="transaction-list__cat-group-header">
                    <input
                      ref={(el) => {
                        if (el) groupHeaderCheckboxRefs.current.set(g.id, el);
                        else groupHeaderCheckboxRefs.current.delete(g.id);
                      }}
                      type="checkbox"
                      checked={groupChipState(g) === 'all'}
                      onChange={(e) => onGroupFilterChange(g, e.target.checked)}
                    />
                    <span
                      className="transaction-list__cat-group-header-dot"
                      style={{ background: g.color }}
                    />
                    <span className="transaction-list__cat-group-header-name">
                      {g.name}
                    </span>
                  </label>
                  <div className="transaction-list__cat-suboptions">
                    {g.categories.map((c) => (
                      <label
                        key={c.id}
                        className="transaction-list__cat-option transaction-list__cat-option--sub"
                      >
                        <input
                          type="checkbox"
                          checked={isCategoryChecked(c.id)}
                          onChange={() => toggleCategoryFilter(c.id)}
                        />
                        <span
                          className="transaction-list__cat-dot"
                          style={{ background: g.color }}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="transaction-list__cat-clear"
                onClick={() => {
                  clearCategoryFilter();
                  setCatMenuOpen(false);
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {data && !error && (
        <p className="transaction-list__summary">
          <span>{data.totals.count} transactions</span>
          <span className="transaction-list__summary-sep">·</span>
          <>{formatCurrency(data.totals.expenseCents)} spent</>
          <span className="transaction-list__summary-sep">·</span>
          <>{formatCurrency(data.totals.incomeCents)} earned</>
          <span className="transaction-list__summary-sep">·</span>
          net{' '}
          <span
            className={
              netPositive
                ? 'transaction-list__net transaction-list__net--pos'
                : 'transaction-list__net transaction-list__net--neg'
            }
          >
            {data.totals.netCents >= 0
              ? `+${formatCurrency(data.totals.netCents)}`
              : formatCurrency(data.totals.netCents)}
          </span>
          {refreshing && (
            <span className="transaction-list__refresh-hint">Updating…</span>
          )}
        </p>
      )}

      {error && (
        <div className="transaction-list__error" role="alert">
          <strong>Could not load transactions.</strong> {error}
        </div>
      )}

      {loading && !data && !error && (
        <div className="transaction-list__skeleton" aria-hidden>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="transaction-list__skeleton-row" />
          ))}
        </div>
      )}

      {emptyMonth && (
        <div className="transaction-list__empty">
          <h2 className="transaction-list__empty-title">No transactions yet</h2>
          <p className="transaction-list__empty-text">
            No transactions in {formatMonthLabel(monthKey)}. Try importing a CSV
            or selecting a different month.
          </p>
          <Link to="/import" className="btn btn--primary">
            Go to Import
          </Link>
        </div>
      )}

      {emptyFiltered && (
        <div className="transaction-list__empty">
          <h2 className="transaction-list__empty-title">No matches</h2>
          <p className="transaction-list__empty-text">
            No transactions match your filters.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              setSearchText('');
              setCategoryIds(undefined);
              setIncomeOnlySourceIds(undefined);
              setIncomeLineLabel(undefined);
            }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {data && !isEmpty && insightMerchant && (
        <MerchantInsightsCard merchantName={insightMerchant} />
      )}

      {data && !isEmpty && (
        <div
          className={
            refreshing
              ? 'transaction-list__table-wrap transaction-list__table-wrap--refreshing'
              : 'transaction-list__table-wrap'
          }
        >
          <table className="transaction-list__table">
            <colgroup>
              <col className="transaction-list__col transaction-list__col--date" />
              <col className="transaction-list__col transaction-list__col--merchant" />
              <col className="transaction-list__col transaction-list__col--category" />
              <col className="transaction-list__col transaction-list__col--amount" />
              <col className="transaction-list__col transaction-list__col--notes" />
            </colgroup>
            <tbody>
              {mergedRows.map((row, index) => (
                <TransactionTableRows
                  key={rowKey(row)}
                  row={row}
                  zebra={index % 2 === 1}
                  expanded={expandedKey === rowKey(row)}
                  onToggleRow={() =>
                    setExpandedKey((k) =>
                      k === rowKey(row) ? null : rowKey(row)
                    )
                  }
                  groups={groups}
                  incomeSources={incomeSources}
                  savedForId={savedForId}
                  onRecatChange={onRecatChange}
                  onCreateCategory={onCreateCategory}
                  onIncomeSourceChange={onIncomeSourceChange}
                  onRemoveExpense={removeRow}
                  onRemoveIncome={removeIncomeRow}
                  onCloseExpansion={() => setExpandedKey(null)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Sentinel option at the foot of the Recategorize list. */
const NEW_CATEGORY_VALUE = '__new__';

function rowKey(row: MergedTransactionRow) {
  return row.kind === 'expense' ? `e-${row.tx.id}` : `i-${row.inc.id}`;
}

type RowsProps = {
  row: MergedTransactionRow;
  zebra: boolean;
  expanded: boolean;
  onToggleRow: () => void;
  groups: GroupWithCategories[];
  incomeSources: IncomeSourceRow[];
  /** Expense ids flash as-is; income ids flash negated so the two never collide. */
  savedForId: number | null;
  onRecatChange: (id: number, cat: number) => void;
  onCreateCategory: (
    id: number,
    groupId: number,
    name: string
  ) => Promise<void>;
  onIncomeSourceChange: (id: number, sourceId: number) => void;
  onRemoveExpense: (id: number) => void;
  onRemoveIncome: (id: number) => void;
  onCloseExpansion: () => void;
};

function TransactionTableRows({
  row,
  zebra,
  expanded,
  onToggleRow,
  groups,
  incomeSources,
  savedForId,
  onRecatChange,
  onCreateCategory,
  onIncomeSourceChange,
  onRemoveExpense,
  onRemoveIncome,
  onCloseExpansion,
}: RowsProps) {
  const [deleteConfirmExpense, setDeleteConfirmExpense] = useState(false);
  const [deleteConfirmIncome, setDeleteConfirmIncome] = useState(false);
  const [newCat, setNewCat] = useState<{
    name: string;
    groupId: number;
    saving: boolean;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!expanded) {
      setDeleteConfirmExpense(false);
      setDeleteConfirmIncome(false);
      setNewCat(null);
    }
  }, [expanded]);

  const startNewCategory = (currentCategoryId: number) => {
    const home =
      groups.find((g) =>
        g.categories.some((c) => c.id === currentCategoryId)
      ) ?? groups[0];
    if (!home) return;
    setNewCat({ name: '', groupId: home.id, saving: false, error: null });
  };

  const submitNewCategory = async (txId: number) => {
    if (!newCat || newCat.saving) return;
    if (!newCat.name.trim()) {
      setNewCat({ ...newCat, error: 'Enter a name.' });
      return;
    }
    setNewCat({ ...newCat, saving: true, error: null });
    try {
      await onCreateCategory(txId, newCat.groupId, newCat.name);
      setNewCat(null);
    } catch (e) {
      setNewCat(
        (cur) =>
          cur && {
            ...cur,
            saving: false,
            error: e instanceof Error ? e.message : String(e),
          }
      );
    }
  };

  const cls =
    'transaction-list__tr' + (zebra ? ' transaction-list__tr--alt' : '');

  if (row.kind === 'expense') {
    const { tx } = row;
    const notesTrim = tx.notes?.trim() ?? '';
    return (
      <>
        <tr
          className={`${cls} transaction-list__tr--clickable${expanded ? ' transaction-list__tr--expanded' : ''}`}
          onClick={onToggleRow}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleRow();
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
        >
          <td className="transaction-list__td transaction-list__td--date">
            <span className="transaction-list__row-cell transaction-list__row-cell--date">
              {formatDisplayDate(tx.date)}
            </span>
          </td>
          <td className="transaction-list__td transaction-list__td--truncate">
            <span className="transaction-list__row-cell transaction-list__row-cell--truncate">
              {tx.merchant}
            </span>
          </td>
          <td className="transaction-list__td transaction-list__td--truncate transaction-list__td--category">
            <span className="transaction-list__row-cell transaction-list__row-cell--cat">
              <span
                className="transaction-list__dot"
                style={{ background: tx.groupColor }}
              />
              {tx.categoryName}
            </span>
          </td>
          <td className="transaction-list__td transaction-list__td--amount transaction-list__td--expense">
            {formatCurrency(tx.amountCents)}
          </td>
          <td className="transaction-list__td transaction-list__td--notes">
            {notesTrim ? <TransactionNoteBadge note={notesTrim} /> : null}
          </td>
        </tr>
        <tr className="transaction-list__detail-tr" aria-hidden={!expanded}>
          <td colSpan={5} className="transaction-list__detail-td">
            <div
              className={
                expanded
                  ? 'transaction-list__detail-slide transaction-list__detail-slide--open'
                  : 'transaction-list__detail-slide'
              }
            >
              <div
                className="transaction-list__detail transaction-list__detail--panel"
                onClick={onCloseExpansion}
                role="presentation"
              >
                <div className="transaction-list__detail-grid">
                  <div>
                    <div className="transaction-list__detail-label">Notes</div>
                    <div className="transaction-list__detail-value">
                      {notesTrim || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="transaction-list__detail-label">
                      Imported
                    </div>
                    <div className="transaction-list__detail-value">
                      {formatImportedDateOnly(tx.createdAt)}
                    </div>
                  </div>
                  <div
                    className="transaction-list__detail-recat"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="transaction-list__detail-label">
                      Recategorize
                    </div>
                    <div className="transaction-list__recat-row">
                      <select
                        className="transaction-list__select"
                        value={newCat ? NEW_CATEGORY_VALUE : tx.categoryId}
                        onChange={(e) => {
                          if (e.target.value === NEW_CATEGORY_VALUE) {
                            startNewCategory(tx.categoryId);
                            return;
                          }
                          setNewCat(null);
                          onRecatChange(tx.id, Number(e.target.value));
                        }}
                        aria-label="Category"
                      >
                        {groups.map((g) => (
                          <optgroup key={g.id} label={g.name}>
                            {g.categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        <option value={NEW_CATEGORY_VALUE}>
                          + Add a new category…
                        </option>
                      </select>
                      {savedForId === tx.id && (
                        <span className="transaction-list__saved">Saved</span>
                      )}
                    </div>
                    {newCat && (
                      <form
                        className="transaction-list__new-cat"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void submitNewCategory(tx.id);
                        }}
                      >
                        <input
                          className="transaction-list__new-cat-input"
                          type="text"
                          placeholder="Category name"
                          aria-label="New category name"
                          value={newCat.name}
                          autoFocus
                          disabled={newCat.saving}
                          onChange={(e) =>
                            setNewCat({
                              ...newCat,
                              name: e.target.value,
                              error: null,
                            })
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.stopPropagation();
                              setNewCat(null);
                            }
                          }}
                        />
                        <select
                          className="transaction-list__select"
                          aria-label="Group for new category"
                          value={newCat.groupId}
                          disabled={newCat.saving}
                          onChange={(e) =>
                            setNewCat({
                              ...newCat,
                              groupId: Number(e.target.value),
                            })
                          }
                        >
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                        <div className="transaction-list__new-cat-actions">
                          <button
                            type="button"
                            className="transaction-list__link-btn"
                            onClick={() => setNewCat(null)}
                            disabled={newCat.saving}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="transaction-list__new-cat-save"
                            disabled={newCat.saving}
                          >
                            {newCat.saving ? 'Adding…' : 'Add & assign'}
                          </button>
                        </div>
                        {newCat.error && (
                          <p
                            className="transaction-list__new-cat-error"
                            role="alert"
                          >
                            {newCat.error}
                          </p>
                        )}
                      </form>
                    )}
                  </div>
                </div>
                <div
                  className="transaction-list__detail-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  {deleteConfirmExpense ? (
                    <div className="transaction-list__confirm">
                      <span>Delete this transaction?</span>
                      <button
                        type="button"
                        className="transaction-list__link-btn"
                        onClick={() => setDeleteConfirmExpense(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="transaction-list__delete-confirm"
                        onClick={() => {
                          setDeleteConfirmExpense(false);
                          onCloseExpansion();
                          onRemoveExpense(tx.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="transaction-list__delete"
                      onClick={() => setDeleteConfirmExpense(true)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      </>
    );
  }

  const { inc } = row;
  const merchantLabel = inc.description.trim() || inc.sourceName;
  return (
    <>
      <tr
        className={`${cls} transaction-list__tr--clickable${expanded ? ' transaction-list__tr--expanded' : ''}`}
        onClick={onToggleRow}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleRow();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <td className="transaction-list__td transaction-list__td--date">
          <span className="transaction-list__row-cell transaction-list__row-cell--date">
            {formatDisplayDate(inc.date)}
          </span>
        </td>
        <td className="transaction-list__td transaction-list__td--truncate">
          <span className="transaction-list__row-cell transaction-list__row-cell--truncate">
            {merchantLabel}
          </span>
        </td>
        <td className="transaction-list__td transaction-list__td--truncate transaction-list__td--category">
          <span className="transaction-list__row-cell transaction-list__row-cell--cat">
            <span
              className="transaction-list__dot"
              style={{ background: 'var(--accent)' }}
            />
            {inc.sourceName}
          </span>
        </td>
        <td className="transaction-list__td transaction-list__td--amount transaction-list__td--income">
          {formatCurrency(inc.amountCents)}
        </td>
        <td className="transaction-list__td transaction-list__td--notes" />
      </tr>
      <tr className="transaction-list__detail-tr" aria-hidden={!expanded}>
        <td colSpan={5} className="transaction-list__detail-td">
          <div
            className={
              expanded
                ? 'transaction-list__detail-slide transaction-list__detail-slide--open'
                : 'transaction-list__detail-slide'
            }
          >
            <div
              className="transaction-list__detail transaction-list__detail--panel"
              onClick={onCloseExpansion}
              role="presentation"
            >
              <div className="transaction-list__detail-main">
                <p className="transaction-list__income-from">
                  Income from {inc.sourceName}
                </p>
                <div className="transaction-list__detail-grid">
                  <div>
                    <div className="transaction-list__detail-label">
                      Description
                    </div>
                    <div className="transaction-list__detail-value">
                      {inc.description.trim() ? inc.description : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="transaction-list__detail-label">
                      Imported
                    </div>
                    <div className="transaction-list__detail-value">
                      {formatImportedDateOnly(inc.createdAt)}
                    </div>
                  </div>
                  <div
                    className="transaction-list__detail-recat"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="transaction-list__detail-label">
                      Recategorize
                    </div>
                    <div className="transaction-list__recat-row">
                      <select
                        className="transaction-list__select"
                        value={inc.sourceId}
                        onChange={(e) =>
                          onIncomeSourceChange(inc.id, Number(e.target.value))
                        }
                        aria-label="Income source"
                      >
                        {incomeSources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {savedForId === -inc.id && (
                        <span className="transaction-list__saved">Saved</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="transaction-list__detail-actions"
                onClick={(e) => e.stopPropagation()}
              >
                {deleteConfirmIncome ? (
                  <div className="transaction-list__confirm">
                    <span>Delete this transaction?</span>
                    <button
                      type="button"
                      className="transaction-list__link-btn"
                      onClick={() => setDeleteConfirmIncome(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="transaction-list__delete-confirm"
                      onClick={() => {
                        setDeleteConfirmIncome(false);
                        onCloseExpansion();
                        onRemoveIncome(inc.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="transaction-list__delete"
                    onClick={() => setDeleteConfirmIncome(true)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

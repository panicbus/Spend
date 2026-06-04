import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  canGoToPreviousDataMonth,
  formatMonthLabel,
  shiftMonthKey,
} from '../../utils/dates';
import type { BudgetGroup } from '../../../ipc-contract';
import type { BudgetReturnContext } from '../../utils/budgetReturnContext';
import { setBudgetReturnContext } from '../../utils/budgetReturnContext';
import { clearTrendsReturnContext } from '../../utils/trendsReturnContext';
import { useSyncedMonthKey } from '../../hooks/useSyncedMonthKey';
import { useBudget } from '../../hooks/useBudget';
import { SummaryCards } from './SummaryCards';
import { MonthlyPulseCheck } from './MonthlyPulseCheck';
import { SpendingDonut } from './SpendingDonut';
import { CategoryGrid } from './CategoryGrid';
import { IncomeSection } from './IncomeSection';
import { AddGroupModal } from './AddGroupModal';
import { AddCategoriesModal } from './AddCategoriesModal';
import { Button } from '../common/Button';
import { ReturnToCurrentMonthButton } from '../common/ReturnToCurrentMonthButton';
import { MonthNoteSection } from './MonthNoteSection';
import './BudgetDashboard.css';

export function BudgetDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { monthKey, setMonthKey } = useSyncedMonthKey();
  const { groups, income, totals, loading, error, refetch } =
    useBudget(monthKey);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addCatGroupId, setAddCatGroupId] = useState<number | null>(null);

  const hasGroups = groups.length > 0;

  const openAddFlow = () => setAddGroupOpen(true);

  const onGroupCreated = (id: number) => {
    setAddCatGroupId(id);
    void refetch();
  };

  const afterCategoriesModal = () => {
    setAddCatGroupId(null);
    void refetch();
  };

  useEffect(() => {
    const restore = (
      location.state as { budgetRestore?: BudgetReturnContext } | null
    )?.budgetRestore;
    if (
      !restore?.monthKey ||
      !/^\d{4}-\d{2}$/.test(restore.monthKey)
    ) {
      return;
    }
    setMonthKey(restore.monthKey);
    if (restore.openGroupId != null) {
      setExpandedId(restore.openGroupId);
    }
    navigate('/', { replace: true, state: null });
  }, [location.state, navigate, setMonthKey]);

  const openBudgetMonthTransactions = useCallback(
    (
      params: URLSearchParams,
      opts?: Pick<BudgetReturnContext, 'openGroupId'>
    ) => {
      clearTrendsReturnContext();
      const ctx: BudgetReturnContext = {
        monthKey,
        ...(opts?.openGroupId != null ? { openGroupId: opts.openGroupId } : {}),
      };
      setBudgetReturnContext(ctx);
      navigate(`/transactions?${params.toString()}`, {
        state: { budgetReturn: ctx },
      });
    },
    [monthKey, navigate]
  );

  const onDonutLegendGroupClick = useCallback(
    (group: BudgetGroup) => {
      const ids = group.categories.map((c) => c.id);
      if (ids.length === 0) return;
      const q = new URLSearchParams({
        rangeFrom: monthKey,
        rangeTo: monthKey,
        categories: ids.join(','),
      });
      openBudgetMonthTransactions(q);
    },
    [monthKey, openBudgetMonthTransactions]
  );

  const onCategoryLineClick = useCallback(
    (categoryId: number, groupId: number) => {
      const q = new URLSearchParams({
        rangeFrom: monthKey,
        rangeTo: monthKey,
        category: String(categoryId),
      });
      openBudgetMonthTransactions(q, { openGroupId: groupId });
    },
    [monthKey, openBudgetMonthTransactions]
  );

  return (
    <div className="budget-dashboard">
      <header className="budget-dashboard__header">
        <div className="budget-dashboard__header-note">
          <MonthNoteSection monthKey={monthKey} />
        </div>
        <div className="budget-dashboard__month-nav">
          <button
            type="button"
            className="budget-dashboard__nav"
            aria-label="Previous month"
            disabled={!canGoToPreviousDataMonth(monthKey)}
            onClick={() => {
              setMonthKey((k) => shiftMonthKey(k, -1));
              setExpandedId(null);
            }}
          >
            ‹
          </button>
          <h1 className="budget-dashboard__title">
            {formatMonthLabel(monthKey)}
          </h1>
          <button
            type="button"
            className="budget-dashboard__nav"
            aria-label="Next month"
            onClick={() => {
              setMonthKey((k) => shiftMonthKey(k, 1));
              setExpandedId(null);
            }}
          >
            ›
          </button>
        </div>
        <ReturnToCurrentMonthButton
          monthKey={monthKey}
          setMonthKey={setMonthKey}
          onAfterNavigate={() => setExpandedId(null)}
        />
      </header>

      {loading && (
        <p className="budget-dashboard__loading">Loading your budget…</p>
      )}

      {!loading && error && (
        <div className="budget-dashboard__error" role="alert">
          <strong>Could not load budget.</strong> {error}
        </div>
      )}

      {!loading && !error && !hasGroups && (
        <div className="budget-dashboard__empty">
          <h2 className="budget-dashboard__empty-title">
            Let&apos;s set up your budget
          </h2>
          <p className="budget-dashboard__empty-text">
            Start by adding a category group (like Housing or Food). You can
            add line items next and set amounts for this month.
          </p>
          <Button variant="primary" onClick={openAddFlow}>
            Add your first category group
          </Button>
        </div>
      )}

      {!loading && !error && hasGroups && (
        <>
          <SummaryCards monthKey={monthKey} totals={totals} />
          <MonthlyPulseCheck
            monthKey={monthKey}
            groups={groups}
            totals={totals}
          />
          <SpendingDonut
            groups={groups}
            monthKey={monthKey}
            onLegendGroupClick={onDonutLegendGroupClick}
          />
          <CategoryGrid
            groups={groups}
            monthKey={monthKey}
            expandedId={expandedId}
            onToggleGroup={(id) =>
              setExpandedId((cur) => (cur === id ? null : id))
            }
            onBudgetUpdated={refetch}
            onLineClick={onCategoryLineClick}
          />
          <IncomeSection
            income={income}
            monthKey={monthKey}
            onChanged={refetch}
          />
        </>
      )}

      <AddGroupModal
        isOpen={addGroupOpen}
        onClose={() => setAddGroupOpen(false)}
        onCreated={onGroupCreated}
      />

      <AddCategoriesModal
        isOpen={addCatGroupId != null}
        groupId={addCatGroupId}
        onClose={afterCategoriesModal}
      />
    </div>
  );
}

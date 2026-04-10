import React, { useState } from 'react';
import {
  canGoToPreviousDataMonth,
  formatMonthLabel,
  shiftMonthKey,
} from '../../utils/dates';
import { useSyncedMonthKey } from '../../hooks/useSyncedMonthKey';
import { useBudget } from '../../hooks/useBudget';
import { SummaryCards } from './SummaryCards';
import { SpendingDonut } from './SpendingDonut';
import { CategoryGrid } from './CategoryGrid';
import { IncomeSection } from './IncomeSection';
import { AddGroupModal } from './AddGroupModal';
import { AddCategoriesModal } from './AddCategoriesModal';
import { Button } from '../common/Button';
import { ReturnToCurrentMonthButton } from '../common/ReturnToCurrentMonthButton';
import './BudgetDashboard.css';

export function BudgetDashboard() {
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

  return (
    <div className="budget-dashboard">
      <header className="budget-dashboard__header">
        <span className="budget-dashboard__header-spacer" aria-hidden />
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
          <SummaryCards totals={totals} />
          <SpendingDonut groups={groups} />
          <CategoryGrid
            groups={groups}
            monthKey={monthKey}
            expandedId={expandedId}
            onToggleGroup={(id) =>
              setExpandedId((cur) => (cur === id ? null : id))
            }
            onBudgetUpdated={refetch}
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

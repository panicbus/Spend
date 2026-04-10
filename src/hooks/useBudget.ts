import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BudgetGroup, BudgetIncomeRow, BudgetTotals } from '../../ipc-contract';
import { api } from '../services/api';

export function useBudget(monthKey: string) {
  const [groups, setGroups] = useState<BudgetGroup[]>([]);
  const [income, setIncome] = useState<BudgetIncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBudget = useCallback(
    async (mode: 'full' | 'background' = 'full') => {
      const background = mode === 'background';
      if (!background) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await api.getBudget(monthKey);
        setGroups(res.groups ?? []);
        setIncome(res.income ?? []);
        setError(null);
      } catch (e) {
        console.error('useBudget:', e);
        if (!background) {
          setGroups([]);
          setIncome([]);
        }
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!background) {
          setLoading(false);
        }
      }
    },
    [monthKey]
  );

  useEffect(() => {
    void fetchBudget('full');
  }, [fetchBudget]);

  const refetch = useCallback(() => {
    void fetchBudget('background');
  }, [fetchBudget]);

  const totals = useMemo((): BudgetTotals => {
    const totalBudget = groups.reduce((s, g) => s + (g.budget_cents ?? 0), 0);
    const totalSpent = groups.reduce((s, g) => s + (g.spent_cents ?? 0), 0);
    const remaining = totalBudget - totalSpent;
    const incomeBudget = income.reduce((s, i) => s + (i.budget_cents ?? 0), 0);
    const incomeActual = income.reduce(
      (s, i) => s + (i.actual_cents ?? 0),
      0
    );
    return {
      totalBudget,
      totalSpent,
      remaining,
      incomeBudget,
      incomeActual,
    };
  }, [groups, income]);

  return {
    groups,
    income,
    totals,
    loading,
    error,
    refetch,
  };
}

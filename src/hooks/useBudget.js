import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

export function useBudget(monthKey) {
  const [groups, setGroups] = useState([]);
  const [income, setIncome] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBudget = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBudget(monthKey);
      setGroups(res.groups ?? []);
      setIncome(res.income ?? []);
    } catch (e) {
      console.error('useBudget:', e);
      setGroups([]);
      setIncome([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  const totals = useMemo(() => {
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
    refetch: fetchBudget,
  };
}

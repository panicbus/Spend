import { useCallback, useEffect, useState } from 'react';
import type { SetupStatus } from '../../ipc-contract';
import { api } from '../services/api';
import { currentMonthKey } from '../utils/dates';

export function useOnboarding(monthKey = currentMonthKey()) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getSetupStatus(monthKey);
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const completeFirstRun = useCallback(async () => {
    await api.setPreferences({ firstRunComplete: true });
    await refresh();
  }, [refresh]);

  const dismissChecklist = useCallback(async () => {
    await api.setPreferences({ checklistDismissed: true });
    await refresh();
  }, [refresh]);

  const markViewedTransactions = useCallback(async () => {
    await api.setPreferences({ viewedTransactions: true });
    await refresh();
  }, [refresh]);

  return {
    status,
    loading,
    refresh,
    completeFirstRun,
    dismissChecklist,
    markViewedTransactions,
  };
}

/** Non-zero category budgets required to check off "Set budget amounts". */
export const CHECKLIST_BUDGETS_REQUIRED = 5;

export function checklistItemsComplete(status: SetupStatus): boolean {
  return (
    status.groupCount >= 3 &&
    status.transactionCount >= 1 &&
    status.categoriesWithBudgetCount >= CHECKLIST_BUDGETS_REQUIRED &&
    status.viewedTransactions
  );
}

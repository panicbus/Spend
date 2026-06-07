import { useCallback, useEffect, useState } from 'react';
import type { SetupStatus } from '../../ipc-contract';
import { api } from '../services/api';
import { currentMonthKey } from '../utils/dates';

export function useOnboarding(monthKey = currentMonthKey()) {
  const [status, setStatus] = useState<SetupStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getSetupStatus(monthKey);
      setStatus(s);
    } catch {
      setStatus(null);
    }
  }, [monthKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dismissChecklist = useCallback(async () => {
    await api.setPreferences({ checklistDismissed: true });
    await refresh();
  }, [refresh]);

  return {
    status,
    refresh,
    dismissChecklist,
  };
}

export const CHECKLIST_BUDGETS_REQUIRED = 5;

export function checklistItemsComplete(status: SetupStatus): boolean {
  return (
    status.groupCount >= 3 &&
    status.transactionCount >= 1 &&
    status.categoriesWithBudgetCount >= CHECKLIST_BUDGETS_REQUIRED &&
    status.viewedTransactions
  );
}

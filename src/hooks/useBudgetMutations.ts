import { useCallback } from 'react';
import type { SetBudgetDetailsInput } from '../../ipc-contract';
import { api } from '../services/api';
import { dispatchDataChanged } from '../utils/dataChanged';

export function useBudgetMutations() {
  const setBudgetAmount = useCallback(
    async (categoryId: number, monthKey: string, amountCents: number) => {
      await api.setBudgetAmount(categoryId, monthKey, amountCents);
      dispatchDataChanged();
    },
    []
  );

  const setBudgetDetails = useCallback(
    async (
      categoryId: number,
      monthKey: string,
      details: SetBudgetDetailsInput,
      applyToFullYear?: boolean
    ) => {
      await api.setBudgetDetails(categoryId, monthKey, details, applyToFullYear);
      dispatchDataChanged();
    },
    []
  );

  return { setBudgetAmount, setBudgetDetails };
}

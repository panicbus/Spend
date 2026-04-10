import { useCallback } from 'react';
import type { SetBudgetDetailsInput } from '../../ipc-contract';
import { api } from '../services/api';

export function useBudgetMutations() {
  const setBudgetAmount = useCallback(
    (categoryId: number, monthKey: string, amountCents: number) =>
      api.setBudgetAmount(categoryId, monthKey, amountCents),
    []
  );

  const setBudgetDetails = useCallback(
    (
      categoryId: number,
      monthKey: string,
      details: SetBudgetDetailsInput
    ) => api.setBudgetDetails(categoryId, monthKey, details),
    []
  );

  return { setBudgetAmount, setBudgetDetails };
}

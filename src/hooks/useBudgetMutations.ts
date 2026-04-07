import { useCallback } from 'react';
import { api } from '../services/api';

export function useBudgetMutations() {
  const setBudgetAmount = useCallback(
    (categoryId: number, monthKey: string, amountCents: number) =>
      api.setBudgetAmount(categoryId, monthKey, amountCents),
    []
  );

  return { setBudgetAmount };
}

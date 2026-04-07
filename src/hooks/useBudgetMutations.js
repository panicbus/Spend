import { useCallback } from 'react';
import { api } from '../services/api';

export function useBudgetMutations() {
  const setBudgetAmount = useCallback(
    (categoryId, monthKey, amountCents) =>
      api.setBudgetAmount(categoryId, monthKey, amountCents),
    []
  );

  return { setBudgetAmount };
}

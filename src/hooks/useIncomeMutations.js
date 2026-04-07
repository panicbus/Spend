import { useCallback, useState } from 'react';
import { api } from '../services/api';

export function useIncomeMutations() {
  const [loading, setLoading] = useState(false);

  const createIncomeSource = useCallback(async (payload) => {
    setLoading(true);
    try {
      return await api.createIncomeSource(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  const setIncomeBudget = useCallback(
    async (sourceId, monthKey, amountCents) => {
      setLoading(true);
      try {
        await api.setIncomeBudget(sourceId, monthKey, amountCents);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { createIncomeSource, setIncomeBudget, loading };
}

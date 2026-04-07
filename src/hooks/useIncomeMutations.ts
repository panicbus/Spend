import { useCallback, useState } from 'react';
import type { CreateIncomeSourcePayload } from '../../ipc-contract';
import { api } from '../services/api';

export function useIncomeMutations() {
  const [loading, setLoading] = useState(false);

  const createIncomeSource = useCallback(async (payload: CreateIncomeSourcePayload) => {
    setLoading(true);
    try {
      return await api.createIncomeSource(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  const setIncomeBudget = useCallback(
    async (sourceId: number, monthKey: string, amountCents: number) => {
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

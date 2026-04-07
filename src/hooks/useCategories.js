import { useCallback, useState } from 'react';
import { api } from '../services/api';

export function useCategories() {
  const [loading, setLoading] = useState(false);

  const createGroup = useCallback(async (payload) => {
    setLoading(true);
    try {
      return await api.createGroup(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  const createCategory = useCallback(async (payload) => {
    setLoading(true);
    try {
      return await api.createCategory(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  return { createGroup, createCategory, loading };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrendData, TrendRange } from '../../ipc-contract';
import { api } from '../services/api';
import { DATA_CHANGED_EVENT } from '../utils/dataChanged';

const DEFAULT_RANGE: TrendRange = '6m';

export function useTrends() {
  const [range, setRange] = useState<TrendRange>(DEFAULT_RANGE);
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<TrendRange, TrendData>>(new Map());

  const fetchRange = useCallback(async (r: TrendRange, force: boolean) => {
    if (!force) {
      const hit = cacheRef.current.get(r);
      if (hit) {
        setData(hit);
        setLoading(false);
        setError(null);
        return;
      }
    } else {
      cacheRef.current.delete(r);
    }
    setLoading(true);
    setError(null);
    try {
      const d = await api.getTrends(r);
      cacheRef.current.set(r, d);
      setData(d);
    } catch (e) {
      console.error('useTrends:', e);
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRange(range, false);
  }, [range, fetchRange]);

  useEffect(() => {
    const onData = () => {
      cacheRef.current.clear();
      void fetchRange(range, true);
    };
    window.addEventListener(DATA_CHANGED_EVENT, onData);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onData);
  }, [range, fetchRange]);

  return { range, setRange, data, loading, error };
}

import { useCallback, useEffect, useState } from 'react';
import { currentMonthKey } from '../utils/dates';
import {
  MONTH_KEY_CHANGED_EVENT,
  readStoredMonthKey,
  writeStoredMonthKey,
  type MonthKeyChangedDetail,
} from '../utils/monthKeyStorage';

export type SetMonthKeyFn = (
  update: string | ((prev: string) => string)
) => void;

export function useSyncedMonthKey(initialFallback?: string): {
  monthKey: string;
  setMonthKey: SetMonthKeyFn;
} {
  const [monthKey, setMonthKeyState] = useState(() =>
    readStoredMonthKey(initialFallback ?? currentMonthKey())
  );

  useEffect(() => {
    const onExternal = (e: Event) => {
      const m = (e as CustomEvent<MonthKeyChangedDetail>).detail?.monthKey;
      if (m && /^\d{4}-\d{2}$/.test(m)) {
        setMonthKeyState((k) => (k === m ? k : m));
      }
    };
    window.addEventListener(MONTH_KEY_CHANGED_EVENT, onExternal);
    return () =>
      window.removeEventListener(MONTH_KEY_CHANGED_EVENT, onExternal);
  }, []);

  const setMonthKey = useCallback((update: string | ((prev: string) => string)) => {
    setMonthKeyState((prev) => {
      const next = typeof update === 'function' ? update(prev) : update;
      if (next !== prev) {
        writeStoredMonthKey(next);
      }
      return next;
    });
  }, []);

  return { monthKey, setMonthKey };
}

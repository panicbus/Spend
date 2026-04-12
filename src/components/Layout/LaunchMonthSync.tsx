import { useEffect } from 'react';
import { api } from '../../services/api';
import { clampMonthKeyToEarliestData, currentMonthKey } from '../../utils/dates';
import {
  MONTH_KEY_CHANGED_EVENT,
  writeStoredMonthKey,
  type MonthKeyChangedDetail,
} from '../../utils/monthKeyStorage';

/** Once per app load: if user prefers “current month”, sync stored month + notify listeners. */
export function LaunchMonthSync() {
  useEffect(() => {
    let cancelled = false;
    void api.getPreferences().then((p) => {
      if (cancelled) return;
      if (p.defaultMonthOnLaunch === 'current') {
        const cur = clampMonthKeyToEarliestData(currentMonthKey());
        writeStoredMonthKey(cur);
        window.dispatchEvent(
          new CustomEvent<MonthKeyChangedDetail>(MONTH_KEY_CHANGED_EVENT, {
            detail: { monthKey: cur },
          })
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}

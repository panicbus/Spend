import React from 'react';
import type { SetMonthKeyFn } from '../../hooks/useSyncedMonthKey';
import { currentMonthKey } from '../../utils/dates';
import { Button } from './Button';
import './ReturnToCurrentMonthButton.css';

export type ReturnToCurrentMonthButtonProps = {
  monthKey: string;
  setMonthKey: SetMonthKeyFn;
  /** e.g. collapse expanded category cards */
  onAfterNavigate?: () => void;
};

export function ReturnToCurrentMonthButton({
  monthKey,
  setMonthKey,
  onAfterNavigate,
}: ReturnToCurrentMonthButtonProps) {
  const now = currentMonthKey();
  return (
    <Button
      type="button"
      variant="ghost"
      className="return-current-month"
      disabled={monthKey === now}
      onClick={() => {
        setMonthKey(now);
        onAfterNavigate?.();
      }}
    >
      Return to Current Month
    </Button>
  );
}

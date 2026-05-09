import React from 'react';
import { fractionThroughCalendarMonth } from '../../utils/dates';

/** White tick on budget bars showing how far through the calendar month today is */
export function BudgetMonthProgressMarker({ monthKey }: { monthKey: string }) {
  const frac = fractionThroughCalendarMonth(monthKey);
  if (frac == null) return null;

  const dayOfMonth = new Date().getDate();

  return (
    <span
      className="budget-month-progress-marker-hit"
      style={{ left: `${frac * 100}%` }}
      role="img"
      aria-label={`Today is day ${dayOfMonth} of the calendar month`}
    >
      <span className="budget-month-progress-marker__tip" role="tooltip">
        Day {dayOfMonth}
      </span>
      <span className="budget-month-progress-marker" aria-hidden />
    </span>
  );
}

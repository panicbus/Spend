import React from 'react';
import type { BudgetGroup, BudgetTotals } from '../../../ipc-contract';
import { formatCurrency } from '../../services/formatters';
import { currentMonthKey } from '../../utils/dates';
import {
  hotCategoriesAheadOfPace,
  pctThroughMonth,
  roundPct,
  verdictFromPace,
} from '../../utils/monthlyPulse';
import './MonthlyPulseCheck.css';

export type MonthlyPulseCheckProps = {
  monthKey: string;
  groups: BudgetGroup[];
  totals: BudgetTotals;
};

export function MonthlyPulseCheck({
  monthKey,
  groups,
  totals,
}: MonthlyPulseCheckProps) {
  if (monthKey !== currentMonthKey()) return null;

  const totalBudget = totals.totalBudget;
  const totalSpent = totals.totalSpent;

  if (totalBudget <= 0) return null;

  const now = new Date();
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = now.getDate();
  const percentThroughMonth = pctThroughMonth(dayOfMonth, daysInMonth);
  const pctMonth = roundPct(percentThroughMonth);
  const pctBudgetUsed = roundPct(totalSpent / totalBudget);

  const daysRemaining = Math.max(0, daysInMonth - dayOfMonth);
  const isLastDay = dayOfMonth >= daysInMonth;
  const isEarlyMonth = dayOfMonth <= 3;
  const overBudget = totalSpent > totalBudget;
  const noSpending = totalSpent <= 0;

  const hotRows = noSpending
    ? []
    : hotCategoriesAheadOfPace(groups, percentThroughMonth, 3);

  let toneClass = 'monthly-pulse-check--tone-muted';
  let headline = '';
  let secondary: string | null = null;

  if (noSpending) {
    headline = 'No spending recorded this month yet';
  } else if (overBudget) {
    toneClass = 'monthly-pulse-check--tone-danger';
    const overBy = totalSpent - totalBudget;
    headline =
      daysRemaining === 0
        ? `You've already exceeded your ${formatCurrency(totalBudget)} budget by ${formatCurrency(overBy)}.`
        : `You've already exceeded your ${formatCurrency(totalBudget)} budget by ${formatCurrency(overBy)} with ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining.`;
  } else if (isLastDay) {
    toneClass = 'monthly-pulse-check--tone-muted';
    headline = `Month's almost over — you spent ${formatCurrency(totalSpent)} of your ${formatCurrency(totalBudget)} budget.`;
  } else if (isEarlyMonth) {
    toneClass = 'monthly-pulse-check--tone-muted';
    headline = `${dayOfMonth} ${dayOfMonth === 1 ? 'day' : 'days'} in — ${formatCurrency(totalSpent)} spent so far`;
  } else {
    const pace = (totalSpent / totalBudget) / percentThroughMonth;
    const { label, tone } = verdictFromPace(pace);
    if (tone === 'good') toneClass = 'monthly-pulse-check--tone-good';
    else if (tone === 'soft-warn') toneClass = 'monthly-pulse-check--tone-soft-warn';
    else if (tone === 'warn') toneClass = 'monthly-pulse-check--tone-warn';
    else toneClass = 'monthly-pulse-check--tone-danger';

    headline = `${label} — you've used ${pctBudgetUsed}% of your budget and the month is ${pctMonth}% over`;

    const projected = Math.round(totalSpent / percentThroughMonth);
    if (pace > 1) {
      const overshoot = projected - totalBudget;
      secondary = `At this rate you'll spend ~${formatCurrency(projected)} by month end — about ${formatCurrency(overshoot)} over budget`;
    } else if (pace < 1) {
      const undershoot = totalBudget - projected;
      secondary = `On track to come in ~${formatCurrency(undershoot)} under budget`;
    } else {
      secondary = 'On pace to finish right at your budget.';
    }
  }

  const showHot = !noSpending && hotRows.length > 0;

  return (
    <div className={`monthly-pulse-check ${toneClass}`} role="status">
      <p className="monthly-pulse-check__headline">{headline}</p>
      {secondary && (
        <p className="monthly-pulse-check__secondary">{secondary}</p>
      )}
      {showHot && (
        <ul className="monthly-pulse-check__hot" aria-label="Categories ahead of pace">
          {hotRows.map((row) => (
            <li key={row.categoryId} className="monthly-pulse-check__hot-item">
              <span
                className="monthly-pulse-check__dot"
                style={{ background: row.groupColor }}
                aria-hidden
              />
              <span className="monthly-pulse-check__hot-name">{row.name}</span>
              <span className="monthly-pulse-check__hot-meta">
                {formatCurrency(row.spentCents)} / {formatCurrency(row.budgetCents)}
                {' · '}
                {row.pctUsed}% used, month {row.pctMonth}% over · ahead of pace
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

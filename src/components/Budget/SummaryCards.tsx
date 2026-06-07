import React from 'react';
import type { BudgetTotals } from '../../../ipc-contract';
import { formatCurrency } from '../../services/formatters';
import { daysRemainingInMonth, isPastMonthKey } from '../../utils/dates';
import { budgetMoodEmoji } from '../../utils/budgetMoodEmoji';
import './SummaryCards.css';

type SummaryCardsProps = {
  monthKey: string;
  totals: BudgetTotals;
};

export function SummaryCards({ monthKey, totals }: SummaryCardsProps) {
  const {
    totalBudget,
    totalSpent,
    remaining,
    incomeBudget,
    incomeActual,
  } = totals;

  const spentPct =
    totalBudget > 0
      ? Math.min(100, Math.round((totalSpent / totalBudget) * 100))
      : 0;

  const incomeRemaining = incomeBudget - incomeActual;
  const incomeAhead = incomeActual > incomeBudget;
  const incomeAheadAmount = incomeActual - incomeBudget;

  const overBudget = remaining < 0;
  const overBy = overBudget ? Math.abs(remaining) : 0;
  const underBy = remaining > 0 ? remaining : 0;
  const monthComplete = isPastMonthKey(monthKey);
  const daysRemaining = daysRemainingInMonth(monthKey);
  const daysRemainingLabel = `with ${daysRemaining} ${
    daysRemaining === 1 ? 'day' : 'days'
  } remaining`;

  const moodAmount = overBudget ? overBy : underBy;
  const moodEmoji = budgetMoodEmoji(
    moodAmount,
    totalBudget,
    overBudget ? 'over' : 'under'
  );

  const remainingLabel = monthComplete
    ? overBudget
      ? 'You went over budget by:'
      : 'You were under budget by:'
    : overBudget
      ? 'Over budget by'
      : 'Still to go';

  const remainingValue = formatCurrency(
    monthComplete || overBudget ? (overBudget ? overBy : underBy) : remaining
  );

  const tone = overBudget ? 'over' : 'accent';

  return (
    <div className="summary-cards">
      <div className="summary-card summary-card--default">
        <div className="summary-card__label">Total budget</div>
        <div className="summary-card__value">{formatCurrency(totalBudget)}</div>
      </div>

      <div className="summary-card summary-card--default">
        <div className="summary-card__label">
          {monthComplete ? 'Spent' : 'Spent so far'}
        </div>
        <div className="summary-card__value">{formatCurrency(totalSpent)}</div>
        <div className="summary-card__meta">{spentPct}% of budget</div>
      </div>

      <div
        className={`summary-card summary-card--${tone}${
          monthComplete ? ' summary-card--complete' : ''
        }`}
      >
        <div className={`summary-card__label summary-card__label--${tone}`}>
          {remainingLabel}
        </div>
        <div className={`summary-card__value summary-card__value--${tone}`}>
          {remainingValue}
        </div>
        {monthComplete ? (
          <div
            className={`summary-card__mood-bottom summary-card__mood-bottom--${tone}`}
            aria-hidden
          >
            {moodEmoji}
          </div>
        ) : (
          <div className={`summary-card__meta summary-card__meta--${tone}`}>
            {daysRemainingLabel}{' '}
            <span className="summary-card__meta-mood" aria-hidden>
              {moodEmoji}
            </span>
          </div>
        )}
      </div>

      <div className="summary-card summary-card--default">
        <div className="summary-card__label">Income earned</div>
        <div className="summary-card__value">{formatCurrency(incomeActual)}</div>
        <div
          className={
            incomeAhead
              ? 'summary-card__meta summary-card__meta--income-ahead'
              : 'summary-card__meta'
          }
        >
          {incomeAhead
            ? `${formatCurrency(incomeAheadAmount)} ahead of budget`
            : `${formatCurrency(incomeRemaining)} expected remaining`}
        </div>
      </div>
    </div>
  );
}

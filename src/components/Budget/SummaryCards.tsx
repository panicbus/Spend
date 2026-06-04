import React from 'react';
import type { BudgetTotals } from '../../../ipc-contract';
import { formatCurrency } from '../../services/formatters';
import { daysRemainingInMonth } from '../../utils/dates';
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
  const daysRemaining = daysRemainingInMonth(monthKey);
  const daysRemainingLabel = `with ${daysRemaining} ${
    daysRemaining === 1 ? 'day' : 'days'
  } remaining`;

  return (
    <div className="summary-cards">
      <div className="summary-card summary-card--default">
        <div className="summary-card__label">Total budget</div>
        <div className="summary-card__value">{formatCurrency(totalBudget)}</div>
      </div>

      <div className="summary-card summary-card--default">
        <div className="summary-card__label">Spent so far</div>
        <div className="summary-card__value">{formatCurrency(totalSpent)}</div>
        <div className="summary-card__meta">{spentPct}% of budget</div>
      </div>

      <div
        className={
          overBudget
            ? 'summary-card summary-card--over'
            : 'summary-card summary-card--accent'
        }
      >
        <div
          className={
            overBudget
              ? 'summary-card__label summary-card__label--over'
              : 'summary-card__label summary-card__label--accent'
          }
        >
          {overBudget ? "You're over budget by:" : 'Remaining'}
        </div>
        <div
          className={
            overBudget
              ? 'summary-card__value summary-card__value--over'
              : 'summary-card__value summary-card__value--accent'
          }
        >
          {formatCurrency(overBudget ? overBy : remaining)}
        </div>
        <div
          className={
            overBudget
              ? 'summary-card__meta summary-card__meta--over'
              : 'summary-card__meta summary-card__meta--accent'
          }
        >
          {daysRemainingLabel}
        </div>
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

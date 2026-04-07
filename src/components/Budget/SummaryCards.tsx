import React from 'react';
import type { BudgetTotals } from '../../../ipc-contract';
import { formatCurrency } from '../../services/formatters';
import './SummaryCards.css';

type SummaryCardsProps = {
  totals: BudgetTotals;
};

export function SummaryCards({ totals }: SummaryCardsProps) {
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

      <div className="summary-card summary-card--accent">
        <div className="summary-card__label">Remaining</div>
        <div className="summary-card__value summary-card__value--accent">
          {formatCurrency(remaining)}
        </div>
      </div>

      <div className="summary-card summary-card--default">
        <div className="summary-card__label">Income earned</div>
        <div className="summary-card__value">{formatCurrency(incomeActual)}</div>
        <div className="summary-card__meta">
          {formatCurrency(incomeRemaining)} expected remaining
        </div>
      </div>
    </div>
  );
}

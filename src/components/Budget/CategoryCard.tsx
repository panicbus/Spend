import React from 'react';
import type { BudgetGroup } from '../../../ipc-contract';
import { formatCurrency } from '../../services/formatters';
import { CategoryCardLineList } from './CategoryCardLineList';
import './CategoryCard.css';

function pctUsed(spent: number, budget: number) {
  if (budget <= 0) return 0;
  return (spent / budget) * 100;
}

function barFillColor(pct: number, groupColor: string) {
  if (pct >= 100) return 'var(--danger)';
  if (pct >= 85) return 'var(--warn)';
  return groupColor;
}

type CategoryCardProps = {
  group: BudgetGroup;
  monthKey: string;
  /** Mobile: line items expand inside the card */
  expanded: boolean;
  /** Desktop: overlay open for this group (chevron / aria only) */
  detailOpen: boolean;
  detailLayout: 'inline' | 'overlay';
  onToggle: () => void;
  onBudgetUpdated: () => void;
};

export function CategoryCard({
  group,
  monthKey,
  expanded,
  detailOpen,
  detailLayout,
  onToggle,
  onBudgetUpdated,
}: CategoryCardProps) {
  const budget = group.budget_cents ?? 0;
  const spent = group.spent_cents ?? 0;
  const pct = pctUsed(spent, budget);
  const fill = barFillColor(pct, group.color);
  const barW = Math.min(100, budget > 0 ? (spent / budget) * 100 : 0);

  const remaining = budget - spent;
  const over = remaining < 0;

  const inlineOpen = detailLayout === 'inline' && expanded;
  const ariaExpanded = detailLayout === 'overlay' ? detailOpen : expanded;

  return (
    <article
      className={`category-card${
        inlineOpen ? ' category-card--expanded' : ''
      }${detailLayout === 'overlay' && detailOpen ? ' category-card--detail-open' : ''}`}
    >
      <button
        type="button"
        className="category-card__header"
        onClick={onToggle}
        aria-expanded={ariaExpanded}
      >
        <span className="category-card__header-top">
          <span className="category-card__title-row">
            <svg
              className="category-card__dot"
              viewBox="0 0 12 12"
              width="12"
              height="12"
              aria-hidden
            >
              <circle cx="6" cy="6" r="6" fill={group.color} />
            </svg>
            <span className="category-card__name">{group.name}</span>
          </span>
          <svg
            className="category-card__chevron"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            />
          </svg>
        </span>
        <span className="category-card__amounts">
          <span className="category-card__spent">{formatCurrency(spent)}</span>
          <span className="category-card__of">
            of {formatCurrency(budget)}
          </span>
        </span>
      </button>

      <div className="category-card__bar-wrap" aria-hidden>
        <div className="category-card__bar-track">
          <div
            className="category-card__bar-fill"
            style={{ width: `${barW}%`, background: fill }}
          />
        </div>
      </div>

      <div className="category-card__footnote">
        {over ? (
          <span className="category-card__over">
            {formatCurrency(-remaining)} over
          </span>
        ) : (
          <span className="category-card__remaining">
            {formatCurrency(remaining)} remaining
          </span>
        )}
      </div>

      {detailLayout === 'inline' && (
        <div
          className={`category-card__lines-shell${
            inlineOpen ? ' category-card__lines-shell--open' : ''
          }`}
          {...(!inlineOpen ? { inert: '' as const } : {})}
        >
          <div className="category-card__lines-measure">
            <CategoryCardLineList
              group={group}
              monthKey={monthKey}
              onBudgetUpdated={onBudgetUpdated}
              variant="in-card"
            />
          </div>
        </div>
      )}
    </article>
  );
}

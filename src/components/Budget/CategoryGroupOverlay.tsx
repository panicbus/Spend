import React, { useEffect } from 'react';
import type { BudgetGroup } from '../../../ipc-contract';
import { formatCurrency } from '../../services/formatters';
import { CategoryCardLineList } from './CategoryCardLineList';
import './CategoryGroupOverlay.css';

type CategoryGroupOverlayProps = {
  group: BudgetGroup;
  monthKey: string;
  onClose: () => void;
  onBudgetUpdated: () => void;
};

export function CategoryGroupOverlay({
  group,
  monthKey,
  onClose,
  onBudgetUpdated,
}: CategoryGroupOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const budget = group.budget_cents ?? 0;
  const spent = group.spent_cents ?? 0;
  const remaining = budget - spent;
  const over = remaining < 0;

  return (
    <div
      className="category-group-overlay__backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="category-group-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-group-overlay-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="category-group-overlay__header">
          <div className="category-group-overlay__title-row">
            <svg
              className="category-group-overlay__dot"
              viewBox="0 0 12 12"
              width="12"
              height="12"
              aria-hidden
            >
              <circle cx="6" cy="6" r="6" fill={group.color} />
            </svg>
            <h2
              id="category-group-overlay-title"
              className="category-group-overlay__title"
            >
              {group.name}
            </h2>
          </div>
          <button
            type="button"
            className="category-group-overlay__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="category-group-overlay__summary">
          <span className="category-group-overlay__spent">
            {formatCurrency(spent)}
          </span>
          <span className="category-group-overlay__of">
            of {formatCurrency(budget)}
          </span>
          <span className="category-group-overlay__dash" aria-hidden>
            ·
          </span>
          {over ? (
            <span className="category-group-overlay__over">
              {formatCurrency(-remaining)} over
            </span>
          ) : (
            <span className="category-group-overlay__remaining">
              {formatCurrency(remaining)} remaining
            </span>
          )}
        </div>
        <div className="category-group-overlay__body">
          <CategoryCardLineList
            group={group}
            monthKey={monthKey}
            onBudgetUpdated={onBudgetUpdated}
            variant="overlay"
          />
        </div>
      </div>
    </div>
  );
}

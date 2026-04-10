import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { BudgetGroup } from '../../../ipc-contract';
import {
  formatCurrency,
  formatInputDollars,
  dollarsFromCentsInput,
} from '../../services/formatters';
import { useBudgetMutations } from '../../hooks/useBudgetMutations';
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
  expanded: boolean;
  onToggle: () => void;
  onBudgetUpdated: () => void;
};

export function CategoryCard({
  group,
  monthKey,
  expanded,
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

  const { setBudgetAmount } = useBudgetMutations();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const linesShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = linesShellRef.current;
    if (!el) return;
    if (expanded) {
      el.removeAttribute('inert');
    } else {
      el.setAttribute('inert', '');
    }
  }, [expanded]);

  const commit = useCallback(
    async (categoryId: number) => {
      const cents = formatInputDollars(draft);
      await setBudgetAmount(categoryId, monthKey, cents);
      setEditingId(null);
      onBudgetUpdated();
    },
    [draft, monthKey, onBudgetUpdated, setBudgetAmount]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, categoryId: number) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commit(categoryId);
      }
    },
    [commit]
  );

  return (
    <article
      className={`category-card${expanded ? ' category-card--expanded' : ''}`}
    >
      <button
        type="button"
        className="category-card__header"
        onClick={onToggle}
        aria-expanded={expanded}
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
        <svg
          className="category-card__bar"
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
        >
          <rect width="100" height="6" rx="3" fill="var(--bar-track)" />
          <rect width={barW} height="6" rx="3" fill={fill} />
        </svg>
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

      <div
        ref={linesShellRef}
        className={`category-card__lines-shell${
          expanded ? ' category-card__lines-shell--open' : ''
        }`}
      >
        <div className="category-card__lines-measure">
          <ul className="category-card__lines">
            {(group.categories ?? []).map((c) => {
              const linePct = pctUsed(c.spent_cents ?? 0, c.budget_cents ?? 0);
              const lineFill = barFillColor(linePct, group.color);
              const lineW = Math.min(
                100,
                (c.budget_cents ?? 0) > 0
                  ? ((c.spent_cents ?? 0) / (c.budget_cents ?? 0)) * 100
                  : 0
              );
              const isEdit = editingId === c.id;
              return (
                <li key={c.id} className="category-card__line">
                  <div className="category-card__line-head">
                    <span className="category-card__line-name">{c.name}</span>
                    <span className="category-card__line-meta">
                      {formatCurrency(c.spent_cents ?? 0)} spent ·{' '}
                      {isEdit ? (
                        <input
                          className="category-card__input"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void commit(c.id)}
                          onKeyDown={(e) => onKeyDown(e, c.id)}
                          autoFocus
                          aria-label={`Budget for ${c.name}`}
                        />
                      ) : (
                        <button
                          type="button"
                          className="category-card__budget-hit"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(c.id);
                            setDraft(dollarsFromCentsInput(c.budget_cents ?? 0));
                          }}
                        >
                          {formatCurrency(c.budget_cents ?? 0)} budget
                        </button>
                      )}
                    </span>
                  </div>
                  <svg
                    className="category-card__line-bar"
                    viewBox="0 0 100 6"
                    preserveAspectRatio="none"
                  >
                    <rect
                      width="100"
                      height="6"
                      rx="3"
                      fill="var(--bar-track)"
                    />
                    <rect width={lineW} height="6" rx="3" fill={lineFill} />
                  </svg>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </article>
  );
}

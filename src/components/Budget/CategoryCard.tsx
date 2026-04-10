import React, { useCallback, useState } from 'react';
import type {
  BudgetCategoryLine,
  BudgetFrequency,
  BudgetGroup,
} from '../../../ipc-contract';
import {
  formatCurrency,
  formatInputDollars,
  dollarsFromCentsInput,
} from '../../services/formatters';
import {
  annualCentsFromPerOccurrenceCents,
  perOccurrenceCentsFromAnnualCents,
  sinkingAmountFieldLabel,
} from '../../utils/budgetFrequency';
import { useBudgetMutations } from '../../hooks/useBudgetMutations';
import './CategoryCard.css';

const FREQUENCY_ORDER: BudgetFrequency[] = [
  'monthly',
  'bimonthly',
  'quarterly',
  'yearly',
];

const FREQUENCY_LABELS: Record<BudgetFrequency, string> = {
  monthly: 'Monthly',
  bimonthly: 'Bimonthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

function pctUsed(spent: number, budget: number) {
  if (budget <= 0) return 0;
  return (spent / budget) * 100;
}

function barFillColor(pct: number, groupColor: string) {
  if (pct >= 100) return 'var(--danger)';
  if (pct >= 85) return 'var(--warn)';
  return groupColor;
}

function isSinkingLine(c: BudgetCategoryLine): boolean {
  return c.frequency !== 'monthly' && c.annual_amount_cents != null;
}

function sinkingBarFill(
  spentYtd: number,
  accumulated: number,
  annual: number,
  groupColor: string
): string {
  if (annual <= 0) return groupColor;
  if (spentYtd > annual) return 'var(--danger)';
  if (spentYtd > accumulated) return 'var(--warn)';
  return groupColor;
}

function sinkingBarWidth(spentYtd: number, annual: number): number {
  if (annual <= 0) return 0;
  return Math.min(100, (spentYtd / annual) * 100);
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

  const { setBudgetDetails } = useBudgetMutations();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFreq, setEditFreq] = useState<BudgetFrequency>('monthly');
  const [editDraft, setEditDraft] = useState('');

  const saveEdit = useCallback(
    async (categoryId: number) => {
      try {
        if (editFreq === 'monthly') {
          await setBudgetDetails(categoryId, monthKey, {
            frequency: 'monthly',
            amountCents: formatInputDollars(editDraft),
          });
        } else {
          await setBudgetDetails(categoryId, monthKey, {
            frequency: editFreq,
            annualAmountCents: annualCentsFromPerOccurrenceCents(
              formatInputDollars(editDraft),
              editFreq
            ),
          });
        }
        setEditingId(null);
        onBudgetUpdated();
      } catch (err) {
        console.error('CategoryCard saveEdit:', err);
      }
    },
    [editDraft, editFreq, monthKey, onBudgetUpdated, setBudgetDetails]
  );

  const onAmountKeyDown = useCallback(
    (e: React.KeyboardEvent, categoryId: number) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void saveEdit(categoryId);
      }
    },
    [saveEdit]
  );

  const beginEdit = useCallback((c: BudgetCategoryLine) => {
    setEditingId(c.id);
    const freq = c.frequency ?? 'monthly';
    setEditFreq(freq);
    if (freq === 'monthly') {
      setEditDraft(dollarsFromCentsInput(c.budget_cents ?? 0));
    } else {
      setEditDraft(
        dollarsFromCentsInput(
          perOccurrenceCentsFromAnnualCents(
            c.annual_amount_cents ?? 0,
            freq
          )
        )
      );
    }
  }, []);

  const selectFreqWhileEditing = useCallback(
    (c: BudgetCategoryLine, newFreq: BudgetFrequency) => {
      if (newFreq === 'monthly') {
        setEditFreq('monthly');
        if (editFreq !== 'monthly') {
          const annualBridge = annualCentsFromPerOccurrenceCents(
            formatInputDollars(editDraft),
            editFreq
          );
          setEditDraft(
            dollarsFromCentsInput(Math.round(annualBridge / 12))
          );
        } else {
          setEditDraft(dollarsFromCentsInput(c.budget_cents ?? 0));
        }
        return;
      }
      if (editFreq === 'monthly') {
        setEditFreq(newFreq);
        const monthlyCents =
          formatInputDollars(editDraft) || (c.budget_cents ?? 0);
        const impliedAnnual = monthlyCents * 12;
        setEditDraft(
          dollarsFromCentsInput(
            perOccurrenceCentsFromAnnualCents(impliedAnnual, newFreq)
          )
        );
        return;
      }
      const draftCents = formatInputDollars(editDraft);
      const bridgedAnnual = annualCentsFromPerOccurrenceCents(
        draftCents,
        editFreq
      );
      setEditFreq(newFreq);
      setEditDraft(
        dollarsFromCentsInput(
          perOccurrenceCentsFromAnnualCents(bridgedAnnual, newFreq)
        )
      );
    },
    [editDraft, editFreq]
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

      <div
        className={`category-card__lines-shell${
          expanded ? ' category-card__lines-shell--open' : ''
        }`}
        {...(!expanded ? { inert: '' as const } : {})}
      >
        <div className="category-card__lines-measure">
          <ul className="category-card__lines">
            {(group.categories ?? []).map((c) => {
              const sinking = isSinkingLine(c);
              const annual = c.annual_amount_cents ?? 0;
              const linePctMonthly = pctUsed(
                c.spent_cents ?? 0,
                c.budget_cents ?? 0
              );
              const lineFill = sinking
                ? sinkingBarFill(
                    c.spent_ytd_cents ?? 0,
                    c.accumulated_cents ?? 0,
                    annual,
                    group.color
                  )
                : barFillColor(linePctMonthly, group.color);
              const lineW = sinking
                ? sinkingBarWidth(c.spent_ytd_cents ?? 0, annual)
                : Math.min(
                    100,
                    (c.budget_cents ?? 0) > 0
                      ? ((c.spent_cents ?? 0) / (c.budget_cents ?? 0)) * 100
                      : 0
                  );
              const isEdit = editingId === c.id;
              const annualFromDraftHint =
                editFreq !== 'monthly'
                  ? annualCentsFromPerOccurrenceCents(
                      formatInputDollars(editDraft) || 0,
                      editFreq
                    )
                  : 0;
              const monthlySetAsideHint =
                editFreq !== 'monthly'
                  ? Math.round(annualFromDraftHint / 12)
                  : 0;

              return (
                <li key={c.id} className="category-card__line">
                  <div className="category-card__line-head">
                    <span className="category-card__line-name">{c.name}</span>
                    <span className="category-card__line-meta">
                      {formatCurrency(c.spent_cents ?? 0)} spent
                      {!sinking && !isEdit && (
                        <>
                          {' '}
                          ·{' '}
                          <button
                            type="button"
                            className="category-card__budget-hit"
                            onClick={(e) => {
                              e.stopPropagation();
                              beginEdit(c);
                            }}
                          >
                            {formatCurrency(c.budget_cents ?? 0)} budget
                          </button>
                        </>
                      )}
                      {sinking && !isEdit && (
                        <>
                          {' '}
                          ·{' '}
                          <button
                            type="button"
                            className="category-card__budget-hit"
                            onClick={(e) => {
                              e.stopPropagation();
                              beginEdit(c);
                            }}
                          >
                            edit
                          </button>
                        </>
                      )}
                    </span>
                  </div>

                  {sinking && !isEdit && (
                    <div className="category-card__line-sinking-sub">
                      {FREQUENCY_LABELS[c.frequency]}
                      {c.frequency !== 'yearly' && (
                        <>
                          {' · '}
                          {formatCurrency(
                            perOccurrenceCentsFromAnnualCents(
                              annual,
                              c.frequency
                            )
                          )}{' '}
                          per bill
                        </>
                      )}
                      {' · '}
                      {formatCurrency(annual)}/yr ·{' '}
                      {formatCurrency(c.budget_cents ?? 0)}/mo set-aside
                    </div>
                  )}

                  {isEdit && (
                    <div
                      className="category-card__budget-edit"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="category-card__freq-row">
                        {FREQUENCY_ORDER.map((f) => (
                          <button
                            key={f}
                            type="button"
                            className={
                              editFreq === f
                                ? 'category-card__freq-pill category-card__freq-pill--active'
                                : 'category-card__freq-pill'
                            }
                            onClick={() => selectFreqWhileEditing(c, f)}
                          >
                            {FREQUENCY_LABELS[f]}
                          </button>
                        ))}
                      </div>
                      <div className="category-card__budget-field">
                        <span className="category-card__budget-field-label">
                          {sinkingAmountFieldLabel(editFreq)}
                        </span>
                        <input
                          className="category-card__input category-card__input--budget"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => onAmountKeyDown(e, c.id)}
                          autoFocus
                          aria-label={`${sinkingAmountFieldLabel(editFreq)} for ${c.name}`}
                        />
                      </div>
                      {editFreq !== 'monthly' && (
                        <p className="category-card__budget-hint">
                          = {formatCurrency(monthlySetAsideHint)}/mo set-aside
                          {editFreq !== 'yearly' && (
                            <>
                              {' · '}
                              {formatCurrency(annualFromDraftHint)}/yr total
                            </>
                          )}
                        </p>
                      )}
                      <div className="category-card__budget-actions">
                        <button
                          type="button"
                          className="category-card__budget-action category-card__budget-action--ghost"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingId(null);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="category-card__budget-action category-card__budget-action--primary"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void saveEdit(c.id);
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}

                  {!isEdit && (
                    <div className="category-card__line-bar-track">
                      <div
                        className="category-card__line-bar-fill"
                        style={{ width: `${lineW}%`, background: lineFill }}
                      />
                    </div>
                  )}

                  {sinking && !isEdit && (
                    <div className="category-card__line-sinking-foot">
                      {formatCurrency(c.accumulated_cents ?? 0)} accumulated ·{' '}
                      {formatCurrency(annual)} annual target ·{' '}
                      {formatCurrency(c.remaining_cents ?? 0)} remaining
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </article>
  );
}

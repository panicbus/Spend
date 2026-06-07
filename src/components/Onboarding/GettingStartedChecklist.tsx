import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SetupStatus } from '../../../ipc-contract';
import {
  CHECKLIST_BUDGETS_REQUIRED,
  checklistItemsComplete,
} from '../../hooks/useOnboarding';
import { Button } from '../common/Button';
import '../common/Button.css';
import './GettingStartedChecklist.css';

type GettingStartedChecklistProps = {
  status: SetupStatus;
  onDismiss: () => void;
  onScrollToCategories?: () => void;
};

type ItemDef = {
  id: string;
  label: string;
  hint?: string;
  done: boolean;
  actionLabel: string;
  onAction: () => void;
};

export function GettingStartedChecklist({
  status,
  onDismiss,
  onScrollToCategories,
}: GettingStartedChecklistProps) {
  const navigate = useNavigate();
  const [celebrating, setCelebrating] = useState(false);

  const categoriesDone = status.groupCount >= 3;
  const importDone = status.transactionCount >= 1;
  const budgetCount = status.categoriesWithBudgetCount;
  const budgetsDone = budgetCount >= CHECKLIST_BUDGETS_REQUIRED;
  const reviewDone = status.viewedTransactions;

  const items: ItemDef[] = [
    {
      id: 'categories',
      label: 'Set up categories',
      done: categoriesDone,
      actionLabel: 'Edit in Settings',
      onAction: () => navigate('/settings'),
    },
    {
      id: 'import',
      label: 'Import your transactions',
      done: importDone,
      actionLabel: 'Go to Import',
      onAction: () => navigate('/import'),
    },
    {
      id: 'budgets',
      label: 'Set budget amounts',
      hint: budgetsDone
        ? undefined
        : `(${budgetCount}/${CHECKLIST_BUDGETS_REQUIRED} set)`,
      done: budgetsDone,
      actionLabel: 'Set budgets',
      onAction: () => onScrollToCategories?.(),
    },
    {
      id: 'review',
      label: 'Review your spending',
      done: reviewDone,
      actionLabel: 'View Transactions',
      onAction: () => navigate('/transactions'),
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const allDone = checklistItemsComplete(status);
  const pct = Math.round((doneCount / items.length) * 100);

  useEffect(() => {
    if (allDone) setCelebrating(true);
  }, [allDone]);

  if (celebrating && allDone) {
    return (
      <div className="getting-started getting-started--celebrate" role="status">
        <div className="getting-started__celebrate-icon" aria-hidden>
          ✓
        </div>
        <h2 className="getting-started__celebrate-title">Setup complete</h2>
        <p className="getting-started__celebrate-body">
          Spend. is ready to help you track your budget.
        </p>
        <Button type="button" variant="primary" onClick={onDismiss}>
          Let&apos;s Go
        </Button>
      </div>
    );
  }

  return (
    <div className="getting-started" role="region" aria-label="Getting started">
      <h2 className="getting-started__title">Getting started</h2>
      <p className="getting-started__sub">
        Complete these steps to get the most out of Spend.
      </p>
      <p className="getting-started__progress">
        {doneCount} of {items.length} complete
      </p>
      <div className="getting-started__bar" aria-hidden>
        <div
          className="getting-started__bar-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="getting-started__list">
        {items.map((item) => (
          <li
            key={item.id}
            className={
              item.done
                ? 'getting-started__item getting-started__item--done'
                : 'getting-started__item'
            }
          >
            <span
              className={
                item.done
                  ? 'getting-started__check getting-started__check--done'
                  : 'getting-started__check'
              }
              aria-hidden
            >
              {item.done ? '✓' : null}
            </span>
            <span className="getting-started__label">
              {item.label}
              {item.hint ? (
                <span className="getting-started__hint"> {item.hint}</span>
              ) : null}
            </span>
            {!item.done ? (
              <button
                type="button"
                className="getting-started__link"
                onClick={item.onAction}
              >
                {item.actionLabel}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

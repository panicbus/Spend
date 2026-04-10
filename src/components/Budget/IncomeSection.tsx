import React, { useCallback, useMemo, useState } from 'react';
import type { BudgetIncomeRow } from '../../../ipc-contract';
import {
  formatCurrency,
  formatInputDollars,
  dollarsFromCentsInput,
} from '../../services/formatters';
import { useIncomeMutations } from '../../hooks/useIncomeMutations';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import './IncomeSection.css';

type IncomeSectionProps = {
  income: BudgetIncomeRow[];
  monthKey: string;
  onChanged: () => void;
};

export function IncomeSection({ income, monthKey, onChanged }: IncomeSectionProps) {
  const { createIncomeSource, setIncomeBudget } = useIncomeMutations();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const commitBudget = useCallback(
    async (sourceId: number) => {
      await setIncomeBudget(sourceId, monthKey, formatInputDollars(draft));
      setEditingId(null);
      onChanged();
    },
    [draft, monthKey, onChanged, setIncomeBudget]
  );

  const onBudgetKeyDown = useCallback(
    (e: React.KeyboardEvent, sourceId: number) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitBudget(sourceId);
      }
    },
    [commitBudget]
  );

  const submitIncome = useCallback(async () => {
    const n = newName.trim();
    if (!n) return;
    await createIncomeSource({ name: n });
    setNewName('');
    setAddOpen(false);
    onChanged();
  }, [createIncomeSource, newName, onChanged]);

  const totals = useMemo(() => {
    let budget = 0;
    let actual = 0;
    for (const row of income) {
      budget += row.budget_cents ?? 0;
      actual += row.actual_cents ?? 0;
    }
    return { budget, actual, remaining: budget - actual };
  }, [income]);

  return (
    <section className="income-section" aria-label="Income">
      <h2 className="income-section__heading">Income</h2>

      <div className="income-section__table">
        <div className="income-section__row income-section__row--head">
          <span>Name</span>
          <span>Budget</span>
          <span>Actual</span>
          <span>Remaining</span>
        </div>
        {income.map((row) => {
          const rem = (row.budget_cents ?? 0) - (row.actual_cents ?? 0);
          const isEdit = editingId === row.id;
          return (
            <div key={row.id} className="income-section__row">
              <span className="income-section__name">{row.name}</span>
              <span className="income-section__cell">
                {isEdit ? (
                  <input
                    className="income-section__input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void commitBudget(row.id)}
                    onKeyDown={(e) => onBudgetKeyDown(e, row.id)}
                    autoFocus
                    aria-label={`Income budget for ${row.name}`}
                  />
                ) : (
                  <button
                    type="button"
                    className="income-section__editable"
                    onClick={() => {
                      setEditingId(row.id);
                      setDraft(dollarsFromCentsInput(row.budget_cents ?? 0));
                    }}
                  >
                    {formatCurrency(row.budget_cents ?? 0)}
                  </button>
                )}
              </span>
              <span className="income-section__cell">
                {formatCurrency(row.actual_cents ?? 0)}
              </span>
              <span className="income-section__cell income-section__cell--muted">
                {formatCurrency(rem)}
              </span>
            </div>
          );
        })}
        {income.length > 0 && (
          <div className="income-section__row income-section__row--total">
            <span className="income-section__name">Total income</span>
            <span className="income-section__cell">
              {formatCurrency(totals.budget)}
            </span>
            <span className="income-section__cell">
              {formatCurrency(totals.actual)}
            </span>
            <span className="income-section__cell income-section__cell--muted">
              {formatCurrency(totals.remaining)}
            </span>
          </div>
        )}
      </div>

      <Button
        variant="dashed"
        className="income-section__add"
        type="button"
        onClick={() => setAddOpen(true)}
      >
        Add income source
      </Button>

      <Modal
        title="New income source"
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
      >
        <label className="income-section__field">
          <span className="income-section__label">Name</span>
          <input
            className="income-section__text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Salary"
          />
        </label>
        <div className="income-section__actions">
          <Button variant="ghost" onClick={() => setAddOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submitIncome()}>
            Add
          </Button>
        </div>
      </Modal>
    </section>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import type { BudgetPayload } from '../../../ipc-contract';
import type { CommitImportResult } from '../../types/import';
import spendLogoUrl from '../../assets/spend-icon.png?inline';
import {
  DEFAULT_CATEGORY_GROUPS,
  DEFAULT_INCOME_SOURCES,
} from '../../../defaultSetup';
import { api } from '../../services/api';
import { currentMonthKey } from '../../utils/dates';
import { dispatchDataChanged } from '../../utils/dataChanged';
import { Button } from '../common/Button';
import { ImportView } from '../Import/ImportView';
import {
  budgetEditDraftFromCents,
  CATEGORY_COLOR_PRESETS,
  formatCurrency,
  formatInputDollars,
} from '../../services/formatters';
import './FirstRunWizard.css';

const TOTAL_STEPS = 5;

type ScratchGroup = { name: string; categories: string[] };

type WizardSummary = {
  groupCount: number;
  categoryCount: number;
  importedCount: number | null;
  budgetsSet: number;
};

type FirstRunWizardProps = {
  onComplete: () => void;
};

export function FirstRunWizard({ onComplete }: FirstRunWizardProps) {
  const [step, setStep] = useState(1);
  const [categoryChoice, setCategoryChoice] = useState<'defaults' | 'scratch' | null>(
    null
  );
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [scratchGroups, setScratchGroups] = useState<ScratchGroup[]>([
    { name: '', categories: [''] },
  ]);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importFinished, setImportFinished] = useState(false);
  const [budgetData, setBudgetData] = useState<BudgetPayload | null>(null);
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});
  const [suggestLabels, setSuggestLabels] = useState<Record<string, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [summary, setSummary] = useState<WizardSummary | null>(null);
  const monthKey = currentMonthKey();

  const finishWizard = useCallback(async () => {
    await api.setPreferences({ firstRunComplete: true, wizardSeen: true });
    dispatchDataChanged();
    onComplete();
  }, [onComplete]);

  const applyDefaults = async () => {
    const result = await api.seedDefaultSetup();
    setSeedMessage(
      result.created
        ? `Created ${result.groupCount} category groups with ${result.categoryCount} categories. You can rename, add, or remove these anytime in Settings.`
        : `Using your existing ${result.groupCount} category groups.`
    );
    dispatchDataChanged();
  };

  const applyScratch = async () => {
    for (let gi = 0; gi < scratchGroups.length; gi++) {
      const g = scratchGroups[gi];
      const gName = g.name.trim();
      if (!gName) continue;
      const { id: groupId } = await api.createGroup({
        name: gName,
        color: CATEGORY_COLOR_PRESETS[gi % CATEGORY_COLOR_PRESETS.length].value,
      });
      const cats = g.categories.map((c) => c.trim()).filter(Boolean);
      for (const cat of cats) {
        await api.createCategory({ group_id: groupId, name: cat });
      }
    }
    const income = await api.getIncomeSources();
    if (income.length === 0) {
      for (const name of DEFAULT_INCOME_SOURCES) {
        await api.createIncomeSource({ name });
      }
    }
    dispatchDataChanged();
  };

  const loadBudgetStep = useCallback(async () => {
    const [budget, suggestions] = await Promise.all([
      api.getBudget(monthKey),
      api.getBudgetSuggestions(monthKey),
    ]);
    setBudgetData(budget);
    const inputs: Record<string, string> = {};
    const labels: Record<string, string> = {};
    for (const g of budget.groups) {
      for (const c of g.categories) {
        const key = `cat:${c.id}`;
        const sug = suggestions.categories.find((s) => s.id === c.id);
        if (sug && sug.suggestedCents > 0) {
          inputs[key] = budgetEditDraftFromCents(sug.suggestedCents);
          labels[key] = `${sug.label}: ~${formatCurrency(sug.suggestedCents)}`;
        } else {
          inputs[key] = '';
        }
      }
    }
    for (const row of budget.income) {
      const key = `inc:${row.id}`;
      const sug = suggestions.income.find((s) => s.id === row.id);
      if (sug && sug.suggestedCents > 0) {
        inputs[key] = budgetEditDraftFromCents(sug.suggestedCents);
        labels[key] = `${sug.label}: ~${formatCurrency(sug.suggestedCents)}`;
      } else {
        inputs[key] = '';
      }
    }
    setBudgetInputs(inputs);
    setSuggestLabels(labels);
    setExpandedGroups(new Set(budget.groups.map((g) => g.id)));
  }, [monthKey]);

  const advanceToStep = useCallback(async (targetStep: number) => {
    if (targetStep === 4) {
      try {
        await loadBudgetStep();
      } catch {
        /* still advance — user can set budgets manually later */
      }
    }
    setStep(targetStep);
  }, [loadBudgetStep]);

  const saveBudgets = async () => {
    let count = 0;
    for (const [key, raw] of Object.entries(budgetInputs)) {
      const cents = formatInputDollars(raw);
      if (cents <= 0) continue;
      if (key.startsWith('cat:')) {
        const id = Number(key.slice(4));
        await api.setBudgetAmount(id, monthKey, cents);
        count += 1;
      } else if (key.startsWith('inc:')) {
        const id = Number(key.slice(4));
        await api.setIncomeBudget(id, monthKey, cents);
      }
    }
    dispatchDataChanged();
    return count;
  };

  const buildSummary = async (budgetsSet: number) => {
    const status = await api.getSetupStatus(monthKey);
    setSummary({
      groupCount: status.groupCount,
      categoryCount: status.categoryCount,
      importedCount,
      budgetsSet,
    });
  };

  const onImportDone = useCallback((result: CommitImportResult) => {
    setImportedCount(result.imported);
    setImportFinished(true);
    dispatchDataChanged();
    window.setTimeout(() => {
      void advanceToStep(4);
    }, 2000);
  }, [advanceToStep]);

  const goNext = async () => {
    if (step === 2 && categoryChoice === 'scratch') {
      await applyScratch();
    }
    if (step === 4) {
      const budgetsSet = await saveBudgets();
      await buildSummary(budgetsSet);
      setStep(5);
      return;
    }
    if (step === 5) {
      await finishWizard();
      return;
    }
    if (step === 3) {
      if (!importFinished) return;
      await advanceToStep(4);
      return;
    }
    await advanceToStep(step + 1);
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const skipStep = async () => {
    if (step === 4) {
      await buildSummary(0);
      setStep(5);
      return;
    }
    if (step === 3) {
      setImportedCount(null);
      setImportFinished(false);
    }
    await advanceToStep(step + 1);
  };

  const hasBudgetEntry = useMemo(
    () => Object.values(budgetInputs).some((raw) => formatInputDollars(raw) > 0),
    [budgetInputs]
  );

  const canNext =
    step === 1 ||
    (step === 2 && categoryChoice != null) ||
    (step === 3 && importFinished) ||
    (step === 4 && hasBudgetEntry) ||
    step === 5;

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            <img className="first-run-wizard__logo" src={spendLogoUrl} alt="" />
            <h2 className="first-run-wizard__title">Welcome to Spend.</h2>
            <p className="first-run-wizard__body">
              A personal budget tracker that lives on your Mac. No cloud, no
              accounts — your financial data stays on your machine.
            </p>
            <p className="first-run-wizard__sub">
              Let&apos;s get you set up. This takes about 5 minutes, or you can
              skip ahead and set things up later.
            </p>
          </>
        );
      case 2:
        return (
          <>
            <h2 className="first-run-wizard__title">
              How do you want to organize your budget?
            </h2>
            <div className="first-run-wizard__options">
              <button
                type="button"
                className={
                  categoryChoice === 'defaults'
                    ? 'first-run-wizard__option first-run-wizard__option--selected'
                    : 'first-run-wizard__option'
                }
                onClick={() => {
                  setCategoryChoice('defaults');
                  void applyDefaults();
                }}
              >
                <div className="first-run-wizard__option-title">Start with defaults</div>
                <p className="first-run-wizard__option-desc">
                  We&apos;ll set up common budget categories that work for most
                  people. You can customize everything later.
                </p>
                <p className="first-run-wizard__preview">
                  {DEFAULT_CATEGORY_GROUPS.map((g) => g.name).join(' · ')}
                </p>
              </button>
              <button
                type="button"
                className={
                  categoryChoice === 'scratch'
                    ? 'first-run-wizard__option first-run-wizard__option--selected'
                    : 'first-run-wizard__option'
                }
                onClick={() => setCategoryChoice('scratch')}
              >
                <div className="first-run-wizard__option-title">Start from scratch</div>
                <p className="first-run-wizard__option-desc">
                  Set up your own categories and groups from the beginning.
                </p>
              </button>
            </div>
            {seedMessage ? (
              <p className="first-run-wizard__confirm">{seedMessage}</p>
            ) : null}
            {categoryChoice === 'scratch' ? (
              <div className="first-run-wizard__scratch">
                {scratchGroups.map((g, gi) => (
                  <div key={gi} className="first-run-wizard__scratch-row">
                    <input
                      placeholder="Group name"
                      value={g.name}
                      onChange={(e) => {
                        const next = [...scratchGroups];
                        next[gi] = { ...g, name: e.target.value };
                        setScratchGroups(next);
                      }}
                    />
                    <input
                      placeholder="Category (comma-separated)"
                      value={g.categories.join(', ')}
                      onChange={(e) => {
                        const next = [...scratchGroups];
                        next[gi] = {
                          ...g,
                          categories: e.target.value.split(',').map((s) => s.trim()),
                        };
                        setScratchGroups(next);
                      }}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setScratchGroups([...scratchGroups, { name: '', categories: [''] }])
                  }
                >
                  + Add group
                </Button>
              </div>
            ) : null}
          </>
        );
      case 3:
        return (
          <>
            <h2 className="first-run-wizard__title first-run-wizard__title--compact">
              Bring in your transactions
            </h2>
            <p className="first-run-wizard__body first-run-wizard__body--compact">
              Export a CSV from your bank or money app, pick the format, and drop
              the file below.
            </p>
            <div className="first-run-wizard__import-embed">
              <ImportView embedded onImportDone={onImportDone} />
            </div>
          </>
        );
      case 4:
        return (
          <>
            <h2 className="first-run-wizard__title">Set your monthly targets</h2>
            <p className="first-run-wizard__body">
              How much do you plan to spend in each category this month?
            </p>
            <div className="first-run-wizard__budget-list">
              {budgetData?.groups.map((g) => (
                <div key={g.id} className="first-run-wizard__budget-group">
                  <button
                    type="button"
                    className="first-run-wizard__budget-group-head"
                    onClick={() => {
                      const next = new Set(expandedGroups);
                      if (next.has(g.id)) next.delete(g.id);
                      else next.add(g.id);
                      setExpandedGroups(next);
                    }}
                  >
                    <span
                      className="first-run-wizard__budget-dot"
                      style={{ background: g.color }}
                    />
                    {g.name}
                  </button>
                  {expandedGroups.has(g.id) ? (
                    <div className="first-run-wizard__budget-lines">
                      {g.categories.map((c) => {
                        const key = `cat:${c.id}`;
                        return (
                          <div key={c.id} className="first-run-wizard__budget-line">
                            <span>{c.name}</span>
                            <div>
                              <input
                                className="first-run-wizard__budget-input"
                                placeholder="$0"
                                value={budgetInputs[key] ?? ''}
                                onChange={(e) => {
                                  setBudgetInputs((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }));
                                  setSuggestLabels((prev) => {
                                    if (!prev[key]) return prev;
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  });
                                }}
                              />
                              {suggestLabels[key] ? (
                                <span className="first-run-wizard__suggest">
                                  {suggestLabels[key]}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ))}
              {budgetData?.income && budgetData.income.length > 0 ? (
                <div className="first-run-wizard__budget-group">
                  <div className="first-run-wizard__budget-group-head">Income</div>
                  <div className="first-run-wizard__budget-lines">
                    {budgetData.income.map((row) => {
                      const key = `inc:${row.id}`;
                      return (
                        <div key={row.id} className="first-run-wizard__budget-line">
                          <span>{row.name}</span>
                          <div>
                            <input
                              className="first-run-wizard__budget-input"
                              placeholder="$0"
                              value={budgetInputs[key] ?? ''}
                              onChange={(e) => {
                                setBudgetInputs((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }));
                                setSuggestLabels((prev) => {
                                  if (!prev[key]) return prev;
                                  const next = { ...prev };
                                  delete next[key];
                                  return next;
                                });
                              }}
                            />
                            {suggestLabels[key] ? (
                              <span className="first-run-wizard__suggest">
                                {suggestLabels[key]}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        );
      case 5:
        return (
          <>
            <h2 className="first-run-wizard__title">You&apos;re all set!</h2>
            <ul className="first-run-wizard__summary">
              <li>
                {summary && summary.groupCount > 0 ? '✓' : '○'}{' '}
                {summary
                  ? `${summary.groupCount} category groups with ${summary.categoryCount} categories`
                  : 'Categories'}
              </li>
              <li>
                {summary && summary.importedCount != null && summary.importedCount > 0
                  ? '✓'
                  : '○'}{' '}
                {summary?.importedCount != null && summary.importedCount > 0
                  ? `${summary.importedCount} transactions imported`
                  : 'No transactions imported yet'}
              </li>
              <li>
                {summary && summary.budgetsSet > 0 ? '✓' : '○'}{' '}
                {summary && summary.budgetsSet > 0
                  ? `Budgets set for ${summary.budgetsSet} categories`
                  : 'No budgets set yet'}
              </li>
            </ul>
            <p className="first-run-wizard__sub">
              Finish any remaining steps from your dashboard checklist.
            </p>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="first-run-wizard" role="dialog" aria-modal="true">
      <div
        className={
          step === 3
            ? 'first-run-wizard__panel first-run-wizard__panel--import'
            : 'first-run-wizard__panel'
        }
      >
        <div className="first-run-wizard__content">
          <div className="first-run-wizard__step-enter">{renderStep()}</div>
        </div>

        <div className="first-run-wizard__footer">
          <p className="first-run-wizard__step-label">
            Step {step} of {TOTAL_STEPS}
          </p>
          <div className="first-run-wizard__dots" aria-hidden>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={
                  i + 1 === step
                    ? 'first-run-wizard__dot first-run-wizard__dot--active'
                    : 'first-run-wizard__dot'
                }
              />
            ))}
          </div>

          <div className="first-run-wizard__nav">
            {step > 1 ? (
              <Button type="button" variant="ghost" onClick={goBack}>
                Back
              </Button>
            ) : null}
            <Button
              type="button"
              variant="primary"
              disabled={!canNext}
              onClick={() => void goNext()}
            >
              {step === 1
                ? "Let's get started →"
                : step === 5
                  ? 'Go to your dashboard →'
                  : 'Next →'}
            </Button>
          </div>

          {step >= 2 && step <= 4 ? (
            <button
              type="button"
              className="first-run-wizard__skip"
              onClick={() => void skipStep()}
            >
              {step === 3
                ? "I don't have a CSV right now — I'll import later"
                : step === 4
                  ? "I'll set budgets later"
                  : "I'll do this later"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

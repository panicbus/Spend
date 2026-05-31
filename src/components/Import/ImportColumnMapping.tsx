import React from 'react';
import type { DateFormat } from '../../utils/csv-profiles';
import type { ColumnMappingDraft } from '../../hooks/useImport';
import { Button } from '../common/Button';
import './ImportColumnMapping.css';

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'M/D/YYYY', label: 'M/D/YYYY' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
];

type ImportColumnMappingProps = {
  headers: string[];
  draft: ColumnMappingDraft;
  onChange: (patch: Partial<ColumnMappingDraft>) => void;
  onConfirm: () => void;
  onCancel: () => void;
  ready: boolean;
};

function headerOptions(headers: string[], emptyLabel: string) {
  return (
    <>
      <option value="">{emptyLabel}</option>
      {headers.map((h) => (
        <option key={h || '__blank__'} value={h}>
          {h || '(blank column)'}
        </option>
      ))}
    </>
  );
}

export function ImportColumnMapping({
  headers,
  draft,
  onChange,
  onConfirm,
  onCancel,
  ready,
}: ImportColumnMappingProps) {
  const splitMode = draft.amountMode.type === 'split';
  const singleMode = draft.amountMode.type === 'single' ? draft.amountMode : null;
  const splitAmount = draft.amountMode.type === 'split' ? draft.amountMode : null;

  return (
    <div className="import-column-map">
      <p className="import-column-map__lead">
        Assign each column from your CSV. Required fields are marked with *.
      </p>
      <div className="import-column-map__grid">
        <label className="import-column-map__field">
          <span className="import-column-map__label">Date *</span>
          <select
            className="import-select"
            value={draft.dateColumn}
            onChange={(e) => onChange({ dateColumn: e.target.value })}
          >
            {headerOptions(headers, 'Select column…')}
          </select>
        </label>
        <label className="import-column-map__field">
          <span className="import-column-map__label">Date format *</span>
          <select
            className="import-select"
            value={draft.dateFormat}
            onChange={(e) =>
              onChange({ dateFormat: e.target.value as DateFormat })
            }
          >
            {DATE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="import-column-map__field">
          <span className="import-column-map__label">Merchant / Description *</span>
          <select
            className="import-select"
            value={draft.merchantColumn}
            onChange={(e) => onChange({ merchantColumn: e.target.value })}
          >
            {headerOptions(headers, 'Select column…')}
          </select>
        </label>
        <label className="import-column-map__field">
          <span className="import-column-map__label">Amount type *</span>
          <select
            className="import-select"
            value={draft.amountMode.type}
            onChange={(e) => {
              const type = e.target.value as 'single' | 'split';
              if (type === 'split') {
                onChange({
                  amountMode: {
                    type: 'split',
                    debitColumn: '',
                    creditColumn: '',
                  },
                });
              } else {
                onChange({
                  amountMode: {
                    type: 'single',
                    column: '',
                    expenseSign: 'negative',
                  },
                });
              }
            }}
          >
            <option value="single">Single signed amount column</option>
            <option value="split">Separate debit / credit columns</option>
          </select>
        </label>
        {!splitMode && singleMode ? (
          <>
            <label className="import-column-map__field">
              <span className="import-column-map__label">Amount column *</span>
              <select
                className="import-select"
                value={singleMode.column}
                onChange={(e) =>
                  onChange({
                    amountMode: {
                      type: 'single',
                      column: e.target.value,
                      expenseSign: singleMode.expenseSign,
                    },
                  })
                }
              >
                {headerOptions(headers, 'Select column…')}
              </select>
            </label>
            <label className="import-column-map__field">
              <span className="import-column-map__label">Expense sign *</span>
              <select
                className="import-select"
                value={singleMode.expenseSign}
                onChange={(e) =>
                  onChange({
                    amountMode: {
                      type: 'single',
                      column: singleMode.column,
                      expenseSign: e.target.value as 'negative' | 'positive',
                    },
                  })
                }
              >
                <option value="negative">Expenses are negative</option>
                <option value="positive">Expenses are positive</option>
              </select>
            </label>
          </>
        ) : splitAmount ? (
          <>
            <label className="import-column-map__field">
              <span className="import-column-map__label">Debit / Outflow *</span>
              <select
                className="import-select"
                value={splitAmount.debitColumn}
                onChange={(e) =>
                  onChange({
                    amountMode: {
                      type: 'split',
                      debitColumn: e.target.value,
                      creditColumn: splitAmount.creditColumn,
                    },
                  })
                }
              >
                {headerOptions(headers, 'Select column…')}
              </select>
            </label>
            <label className="import-column-map__field">
              <span className="import-column-map__label">Credit / Inflow *</span>
              <select
                className="import-select"
                value={splitAmount.creditColumn}
                onChange={(e) =>
                  onChange({
                    amountMode: {
                      type: 'split',
                      debitColumn: splitAmount.debitColumn,
                      creditColumn: e.target.value,
                    },
                  })
                }
              >
                {headerOptions(headers, 'Select column…')}
              </select>
            </label>
          </>
        ) : null}
        <label className="import-column-map__field">
          <span className="import-column-map__label">Category</span>
          <select
            className="import-select"
            value={draft.categoryColumn}
            onChange={(e) => onChange({ categoryColumn: e.target.value })}
          >
            {headerOptions(headers, 'None')}
          </select>
        </label>
        <label className="import-column-map__field">
          <span className="import-column-map__label">Notes / Memo</span>
          <select
            className="import-select"
            value={draft.notesColumn}
            onChange={(e) => onChange({ notesColumn: e.target.value })}
          >
            {headerOptions(headers, 'None')}
          </select>
        </label>
        <label className="import-column-map__field">
          <span className="import-column-map__label">Account</span>
          <select
            className="import-select"
            value={draft.accountColumn}
            onChange={(e) => onChange({ accountColumn: e.target.value })}
          >
            {headerOptions(headers, 'None')}
          </select>
        </label>
      </div>
      <div className="import-actions import-actions--spread">
        <Button type="button" variant="ghost" className="import-btn-cancel" onClick={onCancel}>
          Cancel import
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!ready}
          onClick={onConfirm}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

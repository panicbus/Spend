import React from 'react';
import type { GroupWithCategories, IncomeSourceRow } from '../../../ipc-contract';

type MappingTargetSelectProps = {
  value: string;
  onChange: (v: string) => void;
  groups: GroupWithCategories[];
  incomeSources: IncomeSourceRow[];
  className?: string;
  /** Import flow only: first option to create a new category inline */
  withCreateCategory?: boolean;
  disabled?: boolean;
};

export function MappingTargetSelect({
  value,
  onChange,
  groups,
  incomeSources,
  className,
  withCreateCategory = false,
  disabled = false,
}: MappingTargetSelectProps) {
  return (
    <select
      className={className ?? 'import-select'}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Choose mapping…</option>
      {withCreateCategory ? (
        <option value="__create_category__">+ Create new category...</option>
      ) : null}
      <optgroup label="Skip">
        <option value="skip">Skip these transactions</option>
      </optgroup>
      <optgroup label="Income">
        {incomeSources.map((s) => (
          <option key={s.id} value={`income:${s.id}`}>
            {s.name}
          </option>
        ))}
      </optgroup>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.name}>
          {g.categories.map((c) => (
            <option key={c.id} value={`cat:${c.id}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

import React from 'react';
import type { BudgetGroup } from '../../../ipc-contract';
import { CategoryCard } from './CategoryCard';
import './CategoryGrid.css';

type CategoryGridProps = {
  groups: BudgetGroup[];
  monthKey: string;
  expandedId: number | null;
  onToggleGroup: (id: number) => void;
  onBudgetUpdated: () => void;
};

export function CategoryGrid({
  groups,
  monthKey,
  expandedId,
  onToggleGroup,
  onBudgetUpdated,
}: CategoryGridProps) {
  return (
    <div className="category-grid">
      {groups.map((g) => (
        <CategoryCard
          key={g.id}
          group={g}
          monthKey={monthKey}
          expanded={expandedId === g.id}
          onToggle={() => onToggleGroup(g.id)}
          onBudgetUpdated={onBudgetUpdated}
        />
      ))}
    </div>
  );
}

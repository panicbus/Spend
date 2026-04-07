import React from 'react';
import { CategoryCard } from './CategoryCard';
import './CategoryGrid.css';

export function CategoryGrid({
  groups,
  monthKey,
  expandedId,
  onToggleGroup,
  onBudgetUpdated,
}) {
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

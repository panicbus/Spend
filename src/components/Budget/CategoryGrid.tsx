import React, { useMemo } from 'react';
import type { BudgetGroup } from '../../../ipc-contract';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { CategoryCard } from './CategoryCard';
import { CategoryGroupOverlay } from './CategoryGroupOverlay';
import './CategoryGrid.css';

/** Matches CategoryCard / grid two-column breakpoint */
const MOBILE_BREAKPOINT = '(max-width: 900px)';

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
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const detailLayout = isMobile ? 'inline' : 'overlay';

  const overlayGroup = useMemo(
    () =>
      !isMobile && expandedId != null
        ? groups.find((g) => g.id === expandedId)
        : undefined,
    [groups, expandedId, isMobile]
  );

  return (
    <>
      <div className="category-grid">
        {groups.map((g) => (
          <CategoryCard
            key={g.id}
            group={g}
            monthKey={monthKey}
            expanded={isMobile && expandedId === g.id}
            detailOpen={!isMobile && expandedId === g.id}
            detailLayout={detailLayout}
            onToggle={() => onToggleGroup(g.id)}
            onBudgetUpdated={onBudgetUpdated}
          />
        ))}
      </div>
      {overlayGroup && (
        <CategoryGroupOverlay
          group={overlayGroup}
          monthKey={monthKey}
          onClose={() => onToggleGroup(overlayGroup.id)}
          onBudgetUpdated={onBudgetUpdated}
        />
      )}
    </>
  );
}

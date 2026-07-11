import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GroupWithCategories, IncomeSourceRow } from '../../../ipc-contract';
import type { MappingTargetType, ParsedRow } from '../../types/import';
import { api } from '../../services/api';
import { Button } from '../common/Button';
import { ImportCreateCategoryForm } from './ImportCreateCategoryForm';
import { MappingTargetSelect } from '../common/MappingTargetSelect';
import {
  isCategoryMappingReady,
  mappingAssignmentToSelectValue,
} from '../../utils/mappingSelectValue';
import './ImportView.css';

export type CategoryMappingAssignment = {
  targetType: MappingTargetType;
  targetId: number | null;
};

export type ImportCategoryMappingPanelProps = {
  unknownCategories: string[];
  rows: ParsedRow[];
  mappingSource?: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: (assignments: Record<string, CategoryMappingAssignment>) => void | Promise<void>;
  onCancel: () => void;
  confirming?: boolean;
};

export function ImportCategoryMappingPanel({
  unknownCategories,
  rows,
  mappingSource = 'monarch',
  title = 'Map categories to Spend.',
  description = "We'll remember these for next time.",
  confirmLabel = 'Continue',
  onConfirm,
  onCancel,
  confirming = false,
}: ImportCategoryMappingPanelProps) {
  const [groups, setGroups] = useState<GroupWithCategories[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSourceRow[]>([]);
  const [assignments, setAssignments] = useState<
    Record<string, CategoryMappingAssignment>
  >({});
  const [creatingMapExternal, setCreatingMapExternal] = useState<string | null>(
    null
  );

  useEffect(() => {
    void Promise.all([api.getGroups(), api.getIncomeSources()]).then(
      ([g, i]) => {
        setGroups(g);
        setIncomeSources(i);
      }
    );
  }, []);

  const groupsSorted = useMemo(
    () => [...groups].sort((a, b) => a.sort_order - b.sort_order),
    [groups]
  );

  const mappingsReady = isCategoryMappingReady(unknownCategories, assignments);

  const assignMapping = useCallback((externalName: string, selectValue: string) => {
    if (selectValue === '__create_category__') return;
    let targetType: MappingTargetType = 'skip';
    let targetId: number | null = null;
    if (selectValue === 'skip') {
      targetType = 'skip';
    } else if (selectValue.startsWith('income:')) {
      targetType = 'income_source';
      targetId = Number(selectValue.slice(7));
    } else if (selectValue.startsWith('cat:')) {
      targetType = 'category';
      targetId = Number(selectValue.slice(4));
    }
    setAssignments((prev) => ({
      ...prev,
      [externalName]: { targetType, targetId },
    }));
  }, []);

  const refreshGroups = useCallback(async () => {
    const g = await api.getGroups();
    setGroups(g);
  }, []);

  return (
    <div className="import-card">
      <h2 className="import-card__title">{title}</h2>
      <p className="import-card__sub">{description}</p>
      <ul className="import-map-list">
        {unknownCategories.map((name) => {
          const count = rows.filter((r) => r.externalCategory === name).length;
          const label = name || '(Uncategorized)';
          const isCreating = creatingMapExternal === name;
          return (
            <li key={name || '__empty__'} className="import-map-item">
              <div className="import-map-item__left">
                <span className="import-map-item__name">{label}</span>
                <span className="import-map-item__badge">
                  {count} transactions
                </span>
              </div>
              {isCreating ? (
                <ImportCreateCategoryForm
                  groupsSorted={groupsSorted}
                  onCancel={() => setCreatingMapExternal(null)}
                  onSubmitSuccess={async (categoryId) => {
                    await api.saveCategoryMapping({
                      externalName: name,
                      targetType: 'category',
                      targetId: categoryId,
                      source: mappingSource,
                    });
                    await refreshGroups();
                    setAssignments((prev) => ({
                      ...prev,
                      [name]: { targetType: 'category', targetId: categoryId },
                    }));
                    setCreatingMapExternal(null);
                  }}
                />
              ) : (
                <MappingTargetSelect
                  className="import-select import-map-item__select"
                  value={mappingAssignmentToSelectValue(assignments[name])}
                  onChange={(v) => {
                    if (v === '__create_category__') {
                      setCreatingMapExternal(name);
                      return;
                    }
                    assignMapping(name, v);
                  }}
                  groups={groupsSorted}
                  incomeSources={incomeSources}
                  withCreateCategory
                />
              )}
            </li>
          );
        })}
      </ul>
      <div className="import-actions import-actions--spread">
        <Button
          type="button"
          variant="ghost"
          className="import-btn-cancel"
          onClick={onCancel}
          disabled={confirming}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!mappingsReady || confirming}
          onClick={() => void onConfirm(assignments)}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

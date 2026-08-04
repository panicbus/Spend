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
  /** Category name → the group the file filed it under, when the export has one. */
  unknownCategoryGroups?: Record<string, string>;
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
  unknownCategoryGroups,
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
  const [adopting, setAdopting] = useState(false);
  const [adoptError, setAdoptError] = useState<string | null>(null);

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

  /** Categories still waiting on a decision — the ones adoption would cover. */
  const unassigned = useMemo(
    () => unknownCategories.filter((n) => n && !assignments[n]),
    [assignments, unknownCategories]
  );

  /**
   * With no groups in the file everything lands in one "Imported" bucket, which
   * is only worth it when hand-mapping would be a slog. A handful of new names
   * from a familiar export is better mapped onto categories that already exist.
   */
  const BULK_ADOPT_MIN_WITHOUT_GROUPS = 8;

  const namedGroupCount = useMemo(() => {
    const names = new Set<string>();
    for (const n of unassigned) {
      const g = unknownCategoryGroups?.[n];
      if (g) names.add(g);
    }
    return names.size;
  }, [unassigned, unknownCategoryGroups]);

  /**
   * Recreate the file's own categories in one pass rather than making the user
   * hand-map every name — the whole point for someone arriving from another app.
   */
  const adoptFromFile = useCallback(async () => {
    if (unassigned.length === 0) return;
    setAdopting(true);
    setAdoptError(null);
    try {
      const result = await api.adoptImportCategories({
        source: mappingSource,
        items: unassigned.map((name) => ({
          categoryName: name,
          groupName: unknownCategoryGroups?.[name],
          externalName: name,
        })),
      });
      await refreshGroups();
      setAssignments((prev) => {
        const next = { ...prev };
        for (const m of result.mappings) {
          next[m.externalName] = {
            targetType: 'category',
            targetId: m.categoryId,
          };
        }
        return next;
      });
    } catch (e) {
      setAdoptError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdopting(false);
    }
  }, [mappingSource, refreshGroups, unassigned, unknownCategoryGroups]);

  return (
    <div className="import-card">
      <h2 className="import-card__title">{title}</h2>
      <p className="import-card__sub">{description}</p>
      {unassigned.length > 0 &&
        (namedGroupCount > 0 ||
          unassigned.length >= BULK_ADOPT_MIN_WITHOUT_GROUPS) && (
        <div className="import-adopt">
          <div className="import-adopt__text">
            <strong className="import-adopt__lead">
              Keep the categories from this file
            </strong>
            <span className="import-adopt__sub">
              Creates {unassigned.length} categor
              {unassigned.length === 1 ? 'y' : 'ies'}
              {namedGroupCount > 0
                ? ` under ${namedGroupCount} group${namedGroupCount === 1 ? '' : 's'} from the file`
                : ' in a new "Imported" group'}
              , so you can skip mapping them one by one.
            </span>
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={adopting}
            onClick={() => void adoptFromFile()}
          >
            {adopting ? 'Creating…' : `Create all ${unassigned.length}`}
          </Button>
        </div>
      )}
      {adoptError && (
        <p className="import-adopt__error" role="alert">
          {adoptError}
        </p>
      )}
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

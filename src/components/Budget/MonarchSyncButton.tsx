/**
 * Sync from Monarch — dormant until OAuth or GraphQL auth is implemented.
 * Not mounted in BudgetDashboard while MONARCH_SYNC_UI_ENABLED is false in monarch-sync.ts.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { ParsedRow } from '../../types/import';
import { api } from '../../services/api';
import { dispatchDataChanged } from '../../utils/dataChanged';
import { useToast } from '../common/Toast';
import {
  ImportCategoryMappingPanel,
  type CategoryMappingAssignment,
} from '../Import/ImportCategoryMappingPanel';
import './MonarchSyncButton.css';

function SyncIcon() {
  return (
    <svg
      className="monarch-sync__icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

type MappingState = {
  rows: ParsedRow[];
  unmappedCategories: string[];
};

type ButtonPhase = 'idle' | 'loading' | 'success';

export function MonarchSyncButton() {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<ButtonPhase>('idle');
  const [mappingState, setMappingState] = useState<MappingState | null>(null);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    void api.isMonarchSyncEnabled().then(setEnabled);
  }, []);

  useEffect(() => {
    if (phase !== 'success') return;
    const t = window.setTimeout(() => setPhase('idle'), 1500);
    return () => window.clearTimeout(t);
  }, [phase]);

  const runSync = useCallback(async () => {
    setPhase('loading');
    try {
      const result = await api.syncFromMonarch();
      if (result.status === 'no-new') {
        showToast('No new Monarch transactions', 'info');
        setPhase('success');
        return;
      }
      if (result.status === 'imported') {
        showToast(
          `Imported ${result.transactionCount} new transaction${result.transactionCount === 1 ? '' : 's'} from Monarch`,
          'success'
        );
        dispatchDataChanged();
        setPhase('success');
        return;
      }
      if (result.status === 'needs-mapping') {
        setMappingState({
          rows: result.rows,
          unmappedCategories: result.unmappedCategories,
        });
        setPhase('idle');
        return;
      }
      showToast(result.message, 'error');
      setPhase('idle');
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Monarch sync failed.',
        'error'
      );
      setPhase('idle');
    }
  }, [showToast]);

  const handleMappingConfirm = useCallback(
    async (assignments: Record<string, CategoryMappingAssignment>) => {
      if (!mappingState) return;
      setCommitting(true);
      try {
        await Promise.all(
          mappingState.unmappedCategories.map((externalName) => {
            const a = assignments[externalName];
            if (!a) throw new Error('Missing mapping for a category.');
            return api.saveCategoryMapping({
              externalName,
              targetType: a.targetType,
              targetId: a.targetId,
              source: 'monarch',
            });
          })
        );
        const { transactionCount } = await api.commitMappedMonarchRows(
          mappingState.rows
        );
        setMappingState(null);
        if (transactionCount === 0) {
          showToast('No new Monarch transactions', 'info');
        } else {
          showToast(
            `Imported ${transactionCount} new transaction${transactionCount === 1 ? '' : 's'} from Monarch`,
            'success'
          );
        }
        dispatchDataChanged();
        setPhase('success');
      } catch (e) {
        showToast(
          e instanceof Error ? e.message : 'Could not import Monarch transactions.',
          'error'
        );
      } finally {
        setCommitting(false);
      }
    },
    [mappingState, showToast]
  );

  if (!enabled) return null;

  const label =
    phase === 'loading'
      ? 'Syncing…'
      : phase === 'success'
        ? 'Synced'
        : 'Sync from Monarch';

  return (
    <>
      <button
        type="button"
        className={`monarch-sync${phase === 'loading' ? ' monarch-sync--loading' : ''}${phase === 'success' ? ' monarch-sync--success' : ''}`}
        onClick={() => void runSync()}
        disabled={phase === 'loading' || mappingState != null}
        aria-busy={phase === 'loading'}
      >
        {phase === 'loading' ? (
          <span className="monarch-sync__spinner" aria-hidden />
        ) : (
          <SyncIcon />
        )}
        <span>{label}</span>
      </button>

      {mappingState && (
        <div
          className="monarch-sync__overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Map Monarch categories"
        >
          <div className="monarch-sync__dialog">
            <ImportCategoryMappingPanel
              unknownCategories={mappingState.unmappedCategories}
              rows={mappingState.rows}
              mappingSource="monarch"
              title="Map Monarch categories"
              description="New Monarch categories need a Spend. target before import."
              confirmLabel="Import transactions"
              confirming={committing}
              onCancel={() => setMappingState(null)}
              onConfirm={handleMappingConfirm}
            />
          </div>
        </div>
      )}
    </>
  );
}

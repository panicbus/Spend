import { useCallback, useMemo, useState } from 'react';
import type { DuplicatePair } from '../types/import';
import { api } from '../services/api';
import { dispatchDataChanged } from '../utils/dataChanged';

export type DuplicateCleanupState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'results'; pairs: DuplicatePair[] }
  | { kind: 'deleting'; pairs: DuplicatePair[] }
  | { kind: 'done'; deleted: number; remaining: DuplicatePair[] }
  | { kind: 'error'; message: string };

/** Key for a pair, stable across a rescan. */
function pairKey(p: DuplicatePair): string {
  return `${p.remove.kind}:${p.remove.id}`;
}

/**
 * Duplicate cleanup for the stored ledger. Certain matches start selected;
 * near-matches (a few days apart) do not, since consecutive-day repeats at the
 * same merchant are usually real.
 */
export function useDuplicateCleanup() {
  const [state, setState] = useState<DuplicateCleanupState>({ kind: 'idle' });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pairs = useMemo(
    () =>
      state.kind === 'results' || state.kind === 'deleting'
        ? state.pairs
        : state.kind === 'done'
          ? state.remaining
          : [],
    [state]
  );

  const scan = useCallback(async () => {
    setState({ kind: 'scanning' });
    try {
      const found = await api.findDuplicateRows();
      setSelected(
        new Set(
          found.filter((p) => p.verdict === 'duplicate').map((p) => pairKey(p))
        )
      );
      setState({ kind: 'results', pairs: found });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const toggle = useCallback((p: DuplicatePair) => {
    const key = pairKey(p);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /**
   * Bulk select covers certain duplicates only. Near-matches are a judgment
   * call — a daily charge at the same merchant looks exactly like one — so they
   * only ever get removed by being ticked deliberately.
   */
  const selectAllCertain = useCallback(() => {
    setSelected(
      new Set(pairs.filter((p) => p.verdict === 'duplicate').map(pairKey))
    );
  }, [pairs]);

  const selectNone = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback(
    (p: DuplicatePair) => selected.has(pairKey(p)),
    [selected]
  );

  const selectedPairs = useMemo(
    () => pairs.filter((p) => selected.has(pairKey(p))),
    [pairs, selected]
  );

  const selectedTotalCents = useMemo(
    () =>
      selectedPairs.reduce((sum, p) => sum + Math.abs(p.remove.amountCents), 0),
    [selectedPairs]
  );

  const deleteSelected = useCallback(async () => {
    // The list stays live after a removal round, so `done` is a valid state to
    // remove from — the rescan there leaves real pairs still on screen.
    const canDelete = state.kind === 'results' || state.kind === 'done';
    if (!canDelete || selectedPairs.length === 0) return;
    setState({ kind: 'deleting', pairs });
    try {
      const { deleted } = await api.deleteLedgerRows({
        transactionIds: selectedPairs
          .filter((p) => p.remove.kind === 'transaction')
          .map((p) => p.remove.id),
        incomeIds: selectedPairs
          .filter((p) => p.remove.kind === 'income')
          .map((p) => p.remove.id),
      });
      dispatchDataChanged();
      // Rescan so the list reflects what is actually left, not what we assumed.
      const remaining = await api.findDuplicateRows();
      setSelected(new Set());
      setState({ kind: 'done', deleted, remaining });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [state, pairs, selectedPairs]);

  const reset = useCallback(() => {
    setSelected(new Set());
    setState({ kind: 'idle' });
  }, []);

  return {
    state,
    pairs,
    scan,
    toggle,
    selectAllCertain,
    selectNone,
    isSelected,
    selectedCount: selectedPairs.length,
    selectedTotalCents,
    deleteSelected,
    reset,
  };
}

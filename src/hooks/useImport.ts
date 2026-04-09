import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CommitImportResult,
  CommitImportRow,
  MappingTargetType,
  ParsedRow,
} from '../types/import';
import { api } from '../services/api';

export type RowOverride = {
  targetType: MappingTargetType;
  targetId: number | null;
  skip: boolean;
};

export type ImportState =
  | { kind: 'idle' }
  | { kind: 'parsing'; filePath: string }
  | {
      kind: 'mapping';
      filePath: string;
      rows: ParsedRow[];
      unknownCategories: string[];
      assignments: Record<
        string,
        { targetType: MappingTargetType; targetId: number | null }
      >;
    }
  | {
      kind: 'reviewing';
      filePath: string;
      rows: ParsedRow[];
      rowOverrides: Record<number, RowOverride>;
    }
  | { kind: 'committing' }
  | { kind: 'done'; result: CommitImportResult }
  | { kind: 'error'; message: string };

function parseSelectValue(v: string): {
  targetType: MappingTargetType;
  targetId: number | null;
} {
  if (v === 'skip') {
    return { targetType: 'skip', targetId: null };
  }
  if (v.startsWith('income:')) {
    return { targetType: 'income_source', targetId: Number(v.slice(7)) };
  }
  if (v.startsWith('cat:')) {
    return { targetType: 'category', targetId: Number(v.slice(4)) };
  }
  return { targetType: 'skip', targetId: null };
}

export function effectiveRowTarget(
  row: ParsedRow,
  override: RowOverride | undefined
): RowOverride {
  if (override) {
    return override;
  }
  const m = row.mapping;
  if (!m) {
    return { targetType: 'skip', targetId: null, skip: true };
  }
  if (m.targetType === 'skip') {
    return { targetType: 'skip', targetId: null, skip: true };
  }
  return {
    targetType: m.targetType,
    targetId: m.targetId,
    skip: false,
  };
}

function selectValueFromEffective(e: RowOverride): string {
  if (e.skip || e.targetType === 'skip') return 'skip';
  if (e.targetType === 'income_source' && e.targetId != null) {
    return `income:${e.targetId}`;
  }
  if (e.targetType === 'category' && e.targetId != null) {
    return `cat:${e.targetId}`;
  }
  return 'skip';
}

export function reviewSelectValue(
  row: ParsedRow,
  rowOverrides: Record<number, RowOverride>
): string {
  const ov = rowOverrides[row.rowIndex];
  return selectValueFromEffective(effectiveRowTarget(row, ov));
}

function toCommitRow(row: ParsedRow, ov: RowOverride | undefined): CommitImportRow {
  const e = effectiveRowTarget(row, ov);
  const skip = e.skip || e.targetType === 'skip';
  return {
    importHash: row.importHash,
    date: row.date,
    merchant: row.merchant,
    amountCents: row.amountCents,
    originalStatement: row.originalStatement,
    notes: row.notes,
    account: row.account,
    targetType: e.targetType,
    targetId: e.targetId,
    skip,
  };
}

function isMappingReady(
  unknownCategories: string[],
  assignments: Record<
    string,
    { targetType: MappingTargetType; targetId: number | null }
  >
): boolean {
  return unknownCategories.every((name) => assignments[name] !== undefined);
}

export function useImport() {
  const [state, setState] = useState<ImportState>({ kind: 'idle' });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const reset = useCallback(() => {
    setState({ kind: 'idle' });
  }, []);

  const pickFile = useCallback(async () => {
    try {
      const filePath = await api.openCSVDialog();
      if (!filePath) return;
      setState({ kind: 'parsing', filePath });
      const result = await api.parseCSV(filePath);
      if (result.unknownCategories.length > 0) {
        setState({
          kind: 'mapping',
          filePath,
          rows: result.rows,
          unknownCategories: result.unknownCategories,
          assignments: {},
        });
      } else {
        setState({
          kind: 'reviewing',
          filePath,
          rows: result.rows,
          rowOverrides: {},
        });
      }
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const parseDroppedFile = useCallback(async (filePath: string) => {
    try {
      setState({ kind: 'parsing', filePath });
      const result = await api.parseCSV(filePath);
      if (result.unknownCategories.length > 0) {
        setState({
          kind: 'mapping',
          filePath,
          rows: result.rows,
          unknownCategories: result.unknownCategories,
          assignments: {},
        });
      } else {
        setState({
          kind: 'reviewing',
          filePath,
          rows: result.rows,
          rowOverrides: {},
        });
      }
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const assignMapping = useCallback(
    (externalName: string, selectValue: string) => {
      if (!selectValue) return;
      const { targetType, targetId } = parseSelectValue(selectValue);
      setState((s) => {
        if (s.kind !== 'mapping') return s;
        return {
          ...s,
          assignments: {
            ...s.assignments,
            [externalName]: { targetType, targetId },
          },
        };
      });
    },
    []
  );

  const confirmMappings = useCallback(async () => {
    const s = stateRef.current;
    if (s.kind !== 'mapping') return;
    if (!isMappingReady(s.unknownCategories, s.assignments)) return;

    const { filePath, unknownCategories, assignments } = s;
    setState({ kind: 'parsing', filePath });
    try {
      await Promise.all(
        unknownCategories.map((externalName) => {
          const a = assignments[externalName];
          if (!a) throw new Error('Missing mapping for a category.');
          return api.saveCategoryMapping({
            externalName,
            targetType: a.targetType,
            targetId: a.targetId,
          });
        })
      );
      const result = await api.parseCSV(filePath);
      if (result.unknownCategories.length > 0) {
        setState({
          kind: 'error',
          message:
            'Some Monarch categories are still unmapped after save. Please try again.',
        });
        return;
      }
      setState({
        kind: 'reviewing',
        filePath,
        rows: result.rows,
        rowOverrides: {},
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const overrideRow = useCallback((rowIndex: number, selectValue: string) => {
    const { targetType, targetId } = parseSelectValue(selectValue);
    const skip = targetType === 'skip';
    setState((s) => {
      if (s.kind !== 'reviewing') return s;
      return {
        ...s,
        rowOverrides: {
          ...s.rowOverrides,
          [rowIndex]: { targetType, targetId, skip },
        },
      };
    });
  }, []);

  const setRowSkip = useCallback((rowIndex: number, skip: boolean) => {
    setState((s) => {
      if (s.kind !== 'reviewing') return s;
      const row = s.rows.find((r) => r.rowIndex === rowIndex);
      if (!row) return s;
      if (skip) {
        return {
          ...s,
          rowOverrides: {
            ...s.rowOverrides,
            [rowIndex]: {
              targetType: 'skip',
              targetId: null,
              skip: true,
            },
          },
        };
      }
      const m = row.mapping;
      if (!m) return s;
      return {
        ...s,
        rowOverrides: {
          ...s.rowOverrides,
          [rowIndex]: {
            targetType: m.targetType,
            targetId: m.targetId,
            skip: false,
          },
        },
      };
    });
  }, []);

  const commit = useCallback(async () => {
    const s = stateRef.current;
    if (s.kind !== 'reviewing') return;
    const { rows, rowOverrides } = s;
    const payload = rows.map((r) =>
      toCommitRow(r, rowOverrides[r.rowIndex])
    );
    setState({ kind: 'committing' });
    try {
      const result = await api.commitImport(payload);
      setState({ kind: 'done', result });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const mappingsReady =
    state.kind === 'mapping' &&
    isMappingReady(state.unknownCategories, state.assignments);

  return {
    state,
    reset,
    pickFile,
    parseDroppedFile,
    assignMapping,
    confirmMappings,
    mappingsReady,
    overrideRow,
    setRowSkip,
    commit,
  };
}

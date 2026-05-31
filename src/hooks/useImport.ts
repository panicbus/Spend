import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AmountMode,
  DateFormat,
  GenericColumnMapping,
} from '../utils/csv-profiles';
import {
  DEFAULT_IMPORT_PROFILE_ID,
  GENERIC_PROFILE_ID,
} from '../utils/csv-profiles';
import type {
  CommitImportResult,
  CommitImportRow,
  MappingTargetType,
  ParsedRow,
} from '../types/import';
import { api } from '../services/api';
import { currentMonthKey } from '../utils/dates';

export type RowOverride = {
  targetType: MappingTargetType;
  targetId: number | null;
  skip: boolean;
};

export type ColumnMappingDraft = {
  dateColumn: string;
  dateFormat: DateFormat;
  merchantColumn: string;
  amountMode: AmountMode;
  categoryColumn: string;
  notesColumn: string;
  accountColumn: string;
  headerRowIndex: number;
};

export function defaultColumnMappingDraft(): ColumnMappingDraft {
  return {
    dateColumn: '',
    dateFormat: 'MM/DD/YYYY',
    merchantColumn: '',
    amountMode: { type: 'single', column: '', expenseSign: 'negative' },
    categoryColumn: '',
    notesColumn: '',
    accountColumn: '',
    headerRowIndex: 0,
  };
}

export function draftToGenericMapping(
  draft: ColumnMappingDraft
): GenericColumnMapping {
  const mapping: GenericColumnMapping = {
    dateColumn: draft.dateColumn,
    dateFormat: draft.dateFormat,
    merchantColumn: draft.merchantColumn,
    amountMode: draft.amountMode,
    headerRowIndex: draft.headerRowIndex,
  };
  if (draft.categoryColumn) mapping.categoryColumn = draft.categoryColumn;
  if (draft.notesColumn) mapping.notesColumn = draft.notesColumn;
  if (draft.accountColumn) mapping.accountColumn = draft.accountColumn;
  return mapping;
}

export function isColumnMappingDraftReady(draft: ColumnMappingDraft): boolean {
  if (!draft.dateColumn || !draft.merchantColumn) return false;
  if (draft.amountMode.type === 'single') {
    return !!draft.amountMode.column;
  }
  return !!draft.amountMode.debitColumn && !!draft.amountMode.creditColumn;
}

export type ImportState =
  | { kind: 'idle' }
  | { kind: 'parsing'; filePath: string }
  | {
      kind: 'column_mapping';
      filePath: string;
      profileId: string;
      headers: string[];
      draft: ColumnMappingDraft;
    }
  | {
      kind: 'mapping';
      filePath: string;
      profileId: string;
      genericMapping?: GenericColumnMapping | null;
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
      profileId: string;
      rows: ParsedRow[];
      rowOverrides: Record<number, RowOverride>;
    }
  | {
      kind: 'checking_duplicates';
      filePath: string;
      profileId: string;
      rows: ParsedRow[];
      rowOverrides: Record<number, RowOverride>;
    }
  | {
      kind: 'duplicate_warning';
      filePath: string;
      profileId: string;
      rows: ParsedRow[];
      rowOverrides: Record<number, RowOverride>;
      duplicateCount: number;
      importCandidateCount: number;
      newCount: number;
    }
  | { kind: 'committing' }
  | {
      kind: 'done';
      result: CommitImportResult;
      monthSpendingTotal: number | null;
    }
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

function applyParseResult(
  filePath: string,
  profileId: string,
  result: { rows: ParsedRow[]; unknownCategories: string[] },
  genericMapping?: GenericColumnMapping | null
): ImportState {
  if (result.unknownCategories.length > 0) {
    return {
      kind: 'mapping',
      filePath,
      profileId,
      genericMapping,
      rows: result.rows,
      unknownCategories: result.unknownCategories,
      assignments: {},
    };
  }
  return {
    kind: 'reviewing',
    filePath,
    profileId,
    rows: result.rows,
    rowOverrides: {},
  };
}

export function useImport() {
  const [state, setState] = useState<ImportState>({ kind: 'idle' });
  const [profileId, setProfileIdState] = useState(DEFAULT_IMPORT_PROFILE_ID);
  const stateRef = useRef(state);
  const importSessionRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const last = await api.getLastImportProfile();
        if (!cancelled && last) {
          setProfileIdState(last);
        }
      } catch {
        /** default monarch */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setProfileId = useCallback((id: string) => {
    setProfileIdState(id);
    void api.setLastImportProfile(id);
  }, []);

  const reset = useCallback(() => {
    importSessionRef.current += 1;
    setState({ kind: 'idle' });
  }, []);

  const parseWithProfile = useCallback(
    async (
      filePath: string,
      activeProfileId: string,
      genericMapping?: GenericColumnMapping | null
    ) => {
      const sessionAtParse = importSessionRef.current;
      try {
        setState({ kind: 'parsing', filePath });
        const result = await api.parseCSV(filePath, {
          profileId: activeProfileId,
          genericMapping: genericMapping ?? undefined,
        });
        if (importSessionRef.current !== sessionAtParse) return;
        setState(
          applyParseResult(filePath, activeProfileId, result, genericMapping)
        );
      } catch (e) {
        if (importSessionRef.current !== sessionAtParse) return;
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    []
  );

  const beginFileImport = useCallback(
    async (filePath: string, activeProfileId: string) => {
      const sessionAtParse = importSessionRef.current;
      try {
        if (activeProfileId === GENERIC_PROFILE_ID) {
          setState({ kind: 'parsing', filePath });
          const peek = await api.peekCSV(filePath, 0);
          if (importSessionRef.current !== sessionAtParse) return;
          setState({
            kind: 'column_mapping',
            filePath,
            profileId: activeProfileId,
            headers: peek.headers,
            draft: defaultColumnMappingDraft(),
          });
          return;
        }
        await parseWithProfile(filePath, activeProfileId);
      } catch (e) {
        if (importSessionRef.current !== sessionAtParse) return;
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [parseWithProfile]
  );

  const pickFile = useCallback(async () => {
    const sessionAtParse = importSessionRef.current;
    try {
      const filePath = await api.openCSVDialog();
      if (!filePath) return;
      await beginFileImport(filePath, profileId);
    } catch (e) {
      if (importSessionRef.current !== sessionAtParse) return;
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [beginFileImport, profileId]);

  const parseDroppedFile = useCallback(
    async (filePath: string) => {
      const sessionAtParse = importSessionRef.current;
      try {
        await beginFileImport(filePath, profileId);
      } catch (e) {
        if (importSessionRef.current !== sessionAtParse) return;
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [beginFileImport, profileId]
  );

  const updateColumnMappingDraft = useCallback(
    (patch: Partial<ColumnMappingDraft>) => {
      setState((s) => {
        if (s.kind !== 'column_mapping') return s;
        return { ...s, draft: { ...s.draft, ...patch } };
      });
    },
    []
  );

  const confirmColumnMapping = useCallback(async () => {
    const s = stateRef.current;
    if (s.kind !== 'column_mapping') return;
    if (!isColumnMappingDraftReady(s.draft)) return;
    const sessionAt = importSessionRef.current;
    try {
      await parseWithProfile(
        s.filePath,
        s.profileId,
        draftToGenericMapping(s.draft)
      );
    } catch (e) {
      if (importSessionRef.current !== sessionAt) return;
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [parseWithProfile]);

  const assignMapping = useCallback(
    (externalName: string, selectValue: string) => {
      if (!selectValue || selectValue === '__create_category__') return;
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

  const setAssignmentDirect = useCallback(
    (
      externalName: string,
      assignment: { targetType: MappingTargetType; targetId: number | null }
    ) => {
      setState((s) => {
        if (s.kind !== 'mapping') return s;
        return {
          ...s,
          assignments: {
            ...s.assignments,
            [externalName]: assignment,
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

    const {
      filePath,
      profileId: activeProfileId,
      genericMapping,
      unknownCategories,
      assignments,
    } = s;
    const sessionAt = importSessionRef.current;
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
            source: activeProfileId,
          });
        })
      );
      if (importSessionRef.current !== sessionAt) return;
      const result = await api.parseCSV(filePath, {
        profileId: activeProfileId,
        ...(activeProfileId === GENERIC_PROFILE_ID && genericMapping
          ? { genericMapping }
          : {}),
      });
      if (importSessionRef.current !== sessionAt) return;
      if (result.unknownCategories.length > 0) {
        setState({
          kind: 'error',
          message:
            'Some categories are still unmapped after save. Please try again.',
        });
        return;
      }
      setState({
        kind: 'reviewing',
        filePath,
        profileId: activeProfileId,
        rows: result.rows,
        rowOverrides: {},
      });
    } catch (e) {
      if (importSessionRef.current !== sessionAt) return;
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const overrideRow = useCallback((rowIndex: number, selectValue: string) => {
    if (selectValue === '__create_category__') return;
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

  const finishCommit = useCallback(async (payload: CommitImportRow[]) => {
    const sessionAt = importSessionRef.current;
    setState({ kind: 'committing' });
    try {
      const result = await api.commitImport(payload);
      if (importSessionRef.current !== sessionAt) return;
      let monthSpendingTotal: number | null = null;
      const cur = currentMonthKey();
      if (
        result.imported > 0 &&
        (result.addedExpenseCentsByMonth[cur] ?? 0) > 0
      ) {
        monthSpendingTotal = await api.getMonthSpendingTotal(cur);
      }
      if (importSessionRef.current !== sessionAt) return;
      setState({ kind: 'done', result, monthSpendingTotal });
    } catch (e) {
      if (importSessionRef.current !== sessionAt) return;
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const requestImport = useCallback(async () => {
    const s = stateRef.current;
    if (s.kind !== 'reviewing') return;
    const { rows, rowOverrides, filePath, profileId: activeProfileId } = s;
    const payload = rows.map((r) =>
      toCommitRow(r, rowOverrides[r.rowIndex])
    );
    const hashes = payload.filter((r) => !r.skip).map((r) => r.importHash);
    const importCandidateCount = hashes.length;

    if (importCandidateCount === 0) {
      await finishCommit(payload);
      return;
    }

    const sessionAt = importSessionRef.current;
    setState({
      kind: 'checking_duplicates',
      filePath,
      profileId: activeProfileId,
      rows,
      rowOverrides,
    });
    try {
      const duplicateCount = await api.checkDuplicates(hashes);
      if (importSessionRef.current !== sessionAt) return;
      if (duplicateCount === 0) {
        await finishCommit(payload);
        return;
      }
      const newCount = importCandidateCount - duplicateCount;
      if (importSessionRef.current !== sessionAt) return;
      setState({
        kind: 'duplicate_warning',
        filePath,
        profileId: activeProfileId,
        rows,
        rowOverrides,
        duplicateCount,
        importCandidateCount,
        newCount,
      });
    } catch (e) {
      if (importSessionRef.current !== sessionAt) return;
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [finishCommit]);

  const confirmImportDespiteDuplicates = useCallback(async () => {
    const s = stateRef.current;
    if (s.kind !== 'duplicate_warning') return;
    const { rows, rowOverrides } = s;
    const payload = rows.map((r) =>
      toCommitRow(r, rowOverrides[r.rowIndex])
    );
    await finishCommit(payload);
  }, [finishCommit]);

  const cancelDuplicateWarning = useCallback(() => {
    setState((s) => {
      if (s.kind !== 'duplicate_warning') return s;
      return {
        kind: 'reviewing',
        filePath: s.filePath,
        profileId: s.profileId,
        rows: s.rows,
        rowOverrides: s.rowOverrides,
      };
    });
  }, []);

  const mappingsReady =
    state.kind === 'mapping' &&
    isMappingReady(state.unknownCategories, state.assignments);

  const columnMappingReady =
    state.kind === 'column_mapping' && isColumnMappingDraftReady(state.draft);

  return {
    state,
    profileId,
    setProfileId,
    reset,
    pickFile,
    parseDroppedFile,
    updateColumnMappingDraft,
    confirmColumnMapping,
    columnMappingReady,
    assignMapping,
    setAssignmentDirect,
    confirmMappings,
    mappingsReady,
    overrideRow,
    setRowSkip,
    requestImport,
    confirmImportDespiteDuplicates,
    cancelDuplicateWarning,
  };
}

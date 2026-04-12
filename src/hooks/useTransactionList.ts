import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GroupWithCategories } from '../../ipc-contract';
import type {
  IncomeActual,
  Transaction,
  TransactionFilters,
  TransactionListResult,
} from '../types/transactions';
import { api } from '../services/api';
import { DATA_CHANGED_EVENT } from '../utils/dataChanged';
import { currentMonthKey } from '../utils/dates';
import {
  type SetMonthKeyFn,
  useSyncedMonthKey,
} from './useSyncedMonthKey';

export type MergedTransactionRow =
  | { kind: 'expense'; tx: Transaction; sortDate: string; sortCreated: string }
  | { kind: 'income'; inc: IncomeActual; sortDate: string; sortCreated: string };

export interface TransactionDateRange {
  startMonthKey: string;
  endMonthKey: string;
}

export interface UseTransactionListReturn {
  data: TransactionListResult | null;
  mergedRows: MergedTransactionRow[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  monthKey: string;
  setMonthKey: SetMonthKeyFn;
  categoryIds: number[] | undefined;
  setCategoryIds: (ids: number[] | undefined) => void;
  incomeOnlySourceIds: number[] | undefined;
  setIncomeOnlySourceIds: (ids: number[] | undefined) => void;
  incomeLineLabel: string | undefined;
  setIncomeLineLabel: (label: string | undefined) => void;
  dateRange: TransactionDateRange | null;
  setDateRange: (r: TransactionDateRange | null) => void;
  searchText: string;
  setSearchText: (s: string) => void;
  debouncedSearch: string;
  groups: GroupWithCategories[];
  refetch: () => Promise<void>;
  updateRowCategory: (id: number, categoryId: number) => Promise<void>;
  removeRow: (id: number) => void;
  removeIncomeRow: (id: number) => void;
}

function mergeAndSort(
  transactions: Transaction[],
  income: IncomeActual[]
): MergedTransactionRow[] {
  const rows: MergedTransactionRow[] = [
    ...transactions.map((tx) => ({
      kind: 'expense' as const,
      tx,
      sortDate: tx.date,
      sortCreated: tx.createdAt,
    })),
    ...income.map((inc) => ({
      kind: 'income' as const,
      inc,
      sortDate: inc.date,
      sortCreated: inc.createdAt,
    })),
  ];
  rows.sort((a, b) => {
    const d = b.sortDate.localeCompare(a.sortDate);
    if (d !== 0) return d;
    return b.sortCreated.localeCompare(a.sortCreated);
  });
  return rows;
}

/**
 * Read `/transactions?…` deep-link params once on mount so the first fetch matches
 * filters (layout effect runs after the first effects flush).
 */
function readTransactionRouteSearch(): {
  dateRange: TransactionDateRange | null;
  monthFromRange: string | null;
  categoryIds: number[] | undefined;
  incomeOnlySourceIds: number[] | undefined;
  incomeLineLabel: string | undefined;
} {
  if (typeof window === 'undefined') {
    return {
      dateRange: null,
      monthFromRange: null,
      categoryIds: undefined,
      incomeOnlySourceIds: undefined,
      incomeLineLabel: undefined,
    };
  }
  const p = new URLSearchParams(window.location.search);
  let dateRange: TransactionDateRange | null = null;
  let monthFromRange: string | null = null;
  const rf = p.get('rangeFrom');
  const rt = p.get('rangeTo');
  if (
    rf &&
    rt &&
    /^\d{4}-\d{2}$/.test(rf) &&
    /^\d{4}-\d{2}$/.test(rt) &&
    rf <= rt
  ) {
    dateRange = { startMonthKey: rf, endMonthKey: rt };
    monthFromRange = rt;
  }

  let categoryIds: number[] | undefined;
  let incomeOnlySourceIds: number[] | undefined;
  let incomeLineLabel: string | undefined;

  const incomeSource = p.get('incomeSource');
  const incomeLine = p.get('incomeLine');
  if (incomeSource && /^\d+$/.test(incomeSource)) {
    incomeOnlySourceIds = [Number(incomeSource)];
    incomeLineLabel =
      incomeLine != null && incomeLine !== '' ? incomeLine : undefined;
  } else {
    const cat = p.get('category');
    if (cat && /^\d+$/.test(cat)) {
      categoryIds = [Number(cat)];
    }
  }

  return {
    dateRange,
    monthFromRange,
    categoryIds,
    incomeOnlySourceIds,
    incomeLineLabel,
  };
}

function recomputeTotals(
  transactions: Transaction[],
  income: IncomeActual[]
): TransactionListResult['totals'] {
  const expenseCents = transactions.reduce(
    (s, t) => s + Math.abs(t.amountCents),
    0
  );
  const incomeCents = income.reduce((s, i) => s + i.amountCents, 0);
  return {
    expenseCents,
    incomeCents,
    netCents: incomeCents - expenseCents,
    count: transactions.length + income.length,
  };
}

export function useTransactionList(initialMonth?: string): UseTransactionListReturn {
  const routeDeepLink = useMemo(() => readTransactionRouteSearch(), []);
  const { monthKey, setMonthKey } = useSyncedMonthKey(
    routeDeepLink.monthFromRange ?? initialMonth ?? currentMonthKey()
  );
  const [categoryIds, setCategoryIds] = useState<number[] | undefined>(
    () => routeDeepLink.categoryIds
  );
  const [incomeOnlySourceIds, setIncomeOnlySourceIds] = useState<
    number[] | undefined
  >(() => routeDeepLink.incomeOnlySourceIds);
  const [incomeLineLabel, setIncomeLineLabel] = useState<string | undefined>(
    () => routeDeepLink.incomeLineLabel
  );
  const [dateRange, setDateRange] = useState<TransactionDateRange | null>(
    () => routeDeepLink.dateRange
  );
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [data, setData] = useState<TransactionListResult | null>(null);
  const [groups, setGroups] = useState<GroupWithCategories[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchText), 250);
    return () => window.clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const g = await api.getGroups();
        if (!cancelled) setGroups(g ?? []);
      } catch {
        if (!cancelled) setGroups([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filters: TransactionFilters = useMemo(() => {
    const search = debouncedSearch.trim() || undefined;
    const base = {
      monthKey,
      search,
      ...(dateRange ? { dateRange } : {}),
    };
    if (incomeOnlySourceIds && incomeOnlySourceIds.length > 0) {
      return {
        ...base,
        includeIncome: true as const,
        categoryFilter: 'none' as const,
        incomeOnlySourceIds,
        ...(incomeLineLabel != null && incomeLineLabel !== ''
          ? { incomeLineLabel }
          : {}),
      };
    }
    const withIncome = { ...base, includeIncome: true as const };
    if (categoryIds === undefined) {
      return { ...withIncome, categoryFilter: 'all' as const };
    }
    if (categoryIds.length === 0) {
      return { ...withIncome, categoryFilter: 'none' as const };
    }
    return {
      ...withIncome,
      categoryFilter: 'subset' as const,
      categoryIds,
    };
  }, [
    monthKey,
    categoryIds,
    incomeOnlySourceIds,
    incomeLineLabel,
    debouncedSearch,
    dateRange,
  ]);

  const refetch = useCallback(async () => {
    const hadData = dataRef.current !== null;
    setError(null);
    if (hadData) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await api.getTransactions(filters);
      setData(result);
    } catch (e) {
      if (!hadData) setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    const onData = () => {
      void (async () => {
        try {
          const g = await api.getGroups();
          setGroups(g ?? []);
        } catch {
          setGroups([]);
        }
      })();
      void refetch();
    };
    window.addEventListener(DATA_CHANGED_EVENT, onData);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onData);
  }, [refetch]);

  const mergedRows = useMemo(() => {
    if (!data) return [];
    return mergeAndSort(data.transactions, data.income);
  }, [data]);

  const lookupCategory = useCallback(
    (categoryId: number): Pick<
      Transaction,
      'categoryName' | 'groupName' | 'groupColor'
    > => {
      for (const g of groups) {
        const c = g.categories.find((x) => x.id === categoryId);
        if (c) {
          return {
            categoryName: c.name,
            groupName: g.name,
            groupColor: g.color,
          };
        }
      }
      return {
        categoryName: 'Unknown',
        groupName: '',
        groupColor: '#888888',
      };
    },
    [groups]
  );

  const updateRowCategory = useCallback(
    async (id: number, categoryId: number) => {
      const prev = dataRef.current;
      if (!prev) return;
      const tx = prev.transactions.find((t) => t.id === id);
      if (!tx) return;
      const meta = lookupCategory(categoryId);
      const nextTx = prev.transactions.map((t) =>
        t.id === id
          ? {
              ...t,
              categoryId,
              categoryName: meta.categoryName,
              groupName: meta.groupName,
              groupColor: meta.groupColor,
            }
          : t
      );
      setData({ ...prev, transactions: nextTx });
      try {
        await api.updateTransactionCategory(id, categoryId);
      } catch (e) {
        setData(prev);
        throw e;
      }
    },
    [lookupCategory]
  );

  const removeRow = useCallback((id: number) => {
    const prev = dataRef.current;
    if (!prev) return;
    const transactions = prev.transactions.filter((t) => t.id !== id);
    const next: TransactionListResult = {
      ...prev,
      transactions,
      totals: recomputeTotals(transactions, prev.income),
    };
    setData(next);
    void (async () => {
      try {
        await api.deleteTransaction(id);
      } catch (e) {
        setData(prev);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const removeIncomeRow = useCallback((id: number) => {
    const prev = dataRef.current;
    if (!prev) return;
    const income = prev.income.filter((i) => i.id !== id);
    const next: TransactionListResult = {
      ...prev,
      income,
      totals: recomputeTotals(prev.transactions, income),
    };
    setData(next);
    void (async () => {
      try {
        await api.deleteIncomeActual(id);
      } catch (e) {
        setData(prev);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return {
    data,
    mergedRows,
    loading,
    refreshing,
    error,
    monthKey,
    setMonthKey,
    categoryIds,
    setCategoryIds,
    incomeOnlySourceIds,
    setIncomeOnlySourceIds,
    incomeLineLabel,
    setIncomeLineLabel,
    dateRange,
    setDateRange,
    searchText,
    setSearchText,
    debouncedSearch,
    groups,
    refetch,
    updateRowCategory,
    removeRow,
    removeIncomeRow,
  };
}

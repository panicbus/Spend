import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GroupWithCategories } from '../../ipc-contract';
import type {
  IncomeActual,
  Transaction,
  TransactionFilters,
  TransactionListResult,
} from '../types/transactions';
import { api } from '../services/api';
import { currentMonthKey } from '../utils/dates';
import {
  type SetMonthKeyFn,
  useSyncedMonthKey,
} from './useSyncedMonthKey';

export type MergedTransactionRow =
  | { kind: 'expense'; tx: Transaction; sortDate: string; sortCreated: string }
  | { kind: 'income'; inc: IncomeActual; sortDate: string; sortCreated: string };

export interface UseTransactionListReturn {
  data: TransactionListResult | null;
  mergedRows: MergedTransactionRow[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  monthKey: string;
  setMonthKey: (k: string) => void;
  categoryIds: number[] | undefined;
  setCategoryIds: (ids: number[] | undefined) => void;
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
  const { monthKey, setMonthKey } = useSyncedMonthKey(
    initialMonth ?? currentMonthKey()
  );
  const [categoryIds, setCategoryIds] = useState<number[] | undefined>(
    undefined
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
      includeIncome: true as const,
    };
    if (categoryIds === undefined) {
      return { ...base, categoryFilter: 'all' as const };
    }
    if (categoryIds.length === 0) {
      return { ...base, categoryFilter: 'none' as const };
    }
    return {
      ...base,
      categoryFilter: 'subset' as const,
      categoryIds,
    };
  }, [monthKey, categoryIds, debouncedSearch]);

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

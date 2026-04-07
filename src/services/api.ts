import type { SpendApi } from '../../ipc-contract';

function getBridge(): SpendApi {
  if (typeof window === 'undefined' || !window.api) {
    throw new Error(
      'Spend cannot reach the desktop database. Use the Electron window from npm run dev, not a browser tab at http://127.0.0.1:5173.'
    );
  }
  return window.api;
}

export const api = {
  getGroups: () => getBridge().getGroups(),
  createGroup: (payload: Parameters<SpendApi['createGroup']>[0]) =>
    getBridge().createGroup(payload),
  createCategory: (payload: Parameters<SpendApi['createCategory']>[0]) =>
    getBridge().createCategory(payload),
  deleteCategory: (id: number) => getBridge().deleteCategory(id),
  deleteGroup: (id: number) => getBridge().deleteGroup(id),

  getBudget: (monthKey: string) => getBridge().getBudget(monthKey),
  setBudgetAmount: (categoryId: number, monthKey: string, amountCents: number) =>
    getBridge().setBudgetAmount(categoryId, monthKey, amountCents),

  getIncomeSources: () => getBridge().getIncomeSources(),
  createIncomeSource: (payload: Parameters<SpendApi['createIncomeSource']>[0]) =>
    getBridge().createIncomeSource(payload),
  setIncomeBudget: (sourceId: number, monthKey: string, amountCents: number) =>
    getBridge().setIncomeBudget(sourceId, monthKey, amountCents),

  getTransactions: (filters: Parameters<SpendApi['getTransactions']>[0]) =>
    getBridge().getTransactions(filters),
  addTransaction: (payload: Parameters<SpendApi['addTransaction']>[0]) =>
    getBridge().addTransaction(payload),
  importCSV: (filePath: string) => getBridge().importCSV(filePath),
};

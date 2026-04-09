import type { SpendApi } from '../types/api';

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
  updateTransactionCategory: (id: number, categoryId: number) =>
    getBridge().updateTransactionCategory(id, categoryId),
  deleteTransaction: (id: number) => getBridge().deleteTransaction(id),
  deleteIncomeActual: (id: number) => getBridge().deleteIncomeActual(id),

  openCSVDialog: () => getBridge().openCSVDialog(),
  getPathForFile: (file: File) => getBridge().getPathForFile(file),
  parseCSV: (filePath: string) => getBridge().parseCSV(filePath),
  getCategoryMappings: () => getBridge().getCategoryMappings(),
  saveCategoryMapping: (
    input: Parameters<SpendApi['saveCategoryMapping']>[0]
  ) => getBridge().saveCategoryMapping(input),
  commitImport: (rows: Parameters<SpendApi['commitImport']>[0]) =>
    getBridge().commitImport(rows),
};

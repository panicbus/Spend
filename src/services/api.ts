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
  createCategoryForImport: (
    payload: Parameters<SpendApi['createCategoryForImport']>[0]
  ) => getBridge().createCategoryForImport(payload),
  deleteCategory: (id: number) => getBridge().deleteCategory(id),
  deleteGroup: (id: number) => getBridge().deleteGroup(id),
  getPreferences: () => getBridge().getPreferences(),
  setPreferences: (partial: Parameters<SpendApi['setPreferences']>[0]) =>
    getBridge().setPreferences(partial),
  updateGroup: (payload: Parameters<SpendApi['updateGroup']>[0]) =>
    getBridge().updateGroup(payload),
  reorderGroup: (payload: Parameters<SpendApi['reorderGroup']>[0]) =>
    getBridge().reorderGroup(payload),
  moveGroupCategoriesDeleteGroup: (
    payload: Parameters<SpendApi['moveGroupCategoriesDeleteGroup']>[0]
  ) => getBridge().moveGroupCategoriesDeleteGroup(payload),
  getGroupDeletePreview: (groupId: number) =>
    getBridge().getGroupDeletePreview(groupId),
  updateCategory: (payload: Parameters<SpendApi['updateCategory']>[0]) =>
    getBridge().updateCategory(payload),
  reorderCategory: (payload: Parameters<SpendApi['reorderCategory']>[0]) =>
    getBridge().reorderCategory(payload),
  getCategoryDeletePreview: (categoryId: number) =>
    getBridge().getCategoryDeletePreview(categoryId),
  updateIncomeSource: (
    payload: Parameters<SpendApi['updateIncomeSource']>[0]
  ) => getBridge().updateIncomeSource(payload),
  reorderIncomeSource: (
    payload: Parameters<SpendApi['reorderIncomeSource']>[0]
  ) => getBridge().reorderIncomeSource(payload),
  getIncomeSourceDeletePreview: (sourceId: number) =>
    getBridge().getIncomeSourceDeletePreview(sourceId),
  deleteIncomeSource: (sourceId: number) =>
    getBridge().deleteIncomeSource(sourceId),
  deleteCategoryMapping: (mappingId: number) =>
    getBridge().deleteCategoryMapping(mappingId),
  exportDatabaseBackup: () => getBridge().exportDatabaseBackup(),
  importDatabaseBackup: () => getBridge().importDatabaseBackup(),
  resetDatabase: (mode: Parameters<SpendApi['resetDatabase']>[0]) =>
    getBridge().resetDatabase(mode),

  getBudget: (monthKey: string) => getBridge().getBudget(monthKey),
  setBudgetAmount: (categoryId: number, monthKey: string, amountCents: number) =>
    getBridge().setBudgetAmount(categoryId, monthKey, amountCents),
  setBudgetDetails: (
    categoryId: number,
    monthKey: string,
    details: Parameters<SpendApi['setBudgetDetails']>[2],
    applyToFullYear?: Parameters<SpendApi['setBudgetDetails']>[3]
  ) => getBridge().setBudgetDetails(categoryId, monthKey, details, applyToFullYear),

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
  peekCSV: (
    filePath: string,
    headerRowIndex?: number
  ) => getBridge().peekCSV(filePath, headerRowIndex),
  parseCSV: (
    filePath: string,
    options?: Parameters<SpendApi['parseCSV']>[1]
  ) => getBridge().parseCSV(filePath, options),
  getLastImportProfile: () => getBridge().getLastImportProfile(),
  setLastImportProfile: (profileId: string) =>
    getBridge().setLastImportProfile(profileId),
  getCategoryMappings: () => getBridge().getCategoryMappings(),
  saveCategoryMapping: (
    input: Parameters<SpendApi['saveCategoryMapping']>[0]
  ) => getBridge().saveCategoryMapping(input),
  commitImport: (rows: Parameters<SpendApi['commitImport']>[0]) =>
    getBridge().commitImport(rows),
  checkDuplicates: (hashes: Parameters<SpendApi['checkDuplicates']>[0]) =>
    getBridge().checkDuplicates(hashes),
  getMonthSpendingTotal: (
    monthKey: Parameters<SpendApi['getMonthSpendingTotal']>[0]
  ) => getBridge().getMonthSpendingTotal(monthKey),

  getTrends: (range: Parameters<SpendApi['getTrends']>[0]) =>
    getBridge().getTrends(range),

  getMerchantInsights: (
    merchantName: Parameters<SpendApi['getMerchantInsights']>[0]
  ) => getBridge().getMerchantInsights(merchantName),
  getMonthNote: (monthKey: Parameters<SpendApi['getMonthNote']>[0]) =>
    getBridge().getMonthNote(monthKey),
  setMonthNote: (
    monthKey: Parameters<SpendApi['setMonthNote']>[0],
    note: Parameters<SpendApi['setMonthNote']>[1]
  ) => getBridge().setMonthNote(monthKey, note),

  getSetupStatus: (monthKey: string) => getBridge().getSetupStatus(monthKey),
  seedDefaultSetup: () => getBridge().seedDefaultSetup(),
  getBudgetSuggestions: (monthKey: string) =>
    getBridge().getBudgetSuggestions(monthKey),
};

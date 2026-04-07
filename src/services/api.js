/** Thin wrapper around the Electron preload bridge */
function getBridge() {
  if (typeof window === 'undefined' || !window.api) {
    throw new Error(
      'Spend cannot reach the desktop database. Use the Electron window from npm run dev, not a browser tab at http://127.0.0.1:5173.'
    );
  }
  return window.api;
}

export const api = {
  getGroups: () => getBridge().getGroups(),
  createGroup: (payload) => getBridge().createGroup(payload),
  createCategory: (payload) => getBridge().createCategory(payload),
  deleteCategory: (id) => getBridge().deleteCategory(id),
  deleteGroup: (id) => getBridge().deleteGroup(id),

  getBudget: (monthKey) => getBridge().getBudget(monthKey),
  setBudgetAmount: (categoryId, monthKey, amountCents) =>
    getBridge().setBudgetAmount(categoryId, monthKey, amountCents),

  getIncomeSources: () => getBridge().getIncomeSources(),
  createIncomeSource: (payload) => getBridge().createIncomeSource(payload),
  setIncomeBudget: (sourceId, monthKey, amountCents) =>
    getBridge().setIncomeBudget(sourceId, monthKey, amountCents),

  getTransactions: (filters) => getBridge().getTransactions(filters),
  addTransaction: (payload) => getBridge().addTransaction(payload),
  importCSV: (filePath) => getBridge().importCSV(filePath),
};

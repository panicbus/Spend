import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { SpendApi } from './ipc-contract.js';

const api: SpendApi = {
  getGroups: () => ipcRenderer.invoke('getGroups'),
  createGroup: (payload) => ipcRenderer.invoke('createGroup', payload),
  createCategory: (payload) => ipcRenderer.invoke('createCategory', payload),
  createCategoryForImport: (payload) =>
    ipcRenderer.invoke('createCategoryForImport', payload),
  deleteCategory: (id) => ipcRenderer.invoke('deleteCategory', id),
  deleteGroup: (id) => ipcRenderer.invoke('deleteGroup', id),
  getPreferences: () => ipcRenderer.invoke('getPreferences'),
  setPreferences: (partial) => ipcRenderer.invoke('setPreferences', partial),
  updateGroup: (payload) => ipcRenderer.invoke('updateGroup', payload),
  reorderGroup: (payload) => ipcRenderer.invoke('reorderGroup', payload),
  moveGroupCategoriesDeleteGroup: (payload) =>
    ipcRenderer.invoke('moveGroupCategoriesDeleteGroup', payload),
  getGroupDeletePreview: (groupId) =>
    ipcRenderer.invoke('getGroupDeletePreview', groupId),
  updateCategory: (payload) => ipcRenderer.invoke('updateCategory', payload),
  reorderCategory: (payload) => ipcRenderer.invoke('reorderCategory', payload),
  getCategoryDeletePreview: (categoryId) =>
    ipcRenderer.invoke('getCategoryDeletePreview', categoryId),
  updateIncomeSource: (payload) =>
    ipcRenderer.invoke('updateIncomeSource', payload),
  reorderIncomeSource: (payload) =>
    ipcRenderer.invoke('reorderIncomeSource', payload),
  getIncomeSourceDeletePreview: (sourceId) =>
    ipcRenderer.invoke('getIncomeSourceDeletePreview', sourceId),
  deleteIncomeSource: (sourceId) =>
    ipcRenderer.invoke('deleteIncomeSource', sourceId),
  deleteCategoryMapping: (mappingId) =>
    ipcRenderer.invoke('deleteCategoryMapping', mappingId),
  exportDatabaseBackup: () => ipcRenderer.invoke('exportDatabaseBackup'),
  importDatabaseBackup: () => ipcRenderer.invoke('importDatabaseBackup'),
  resetDatabase: (mode) => ipcRenderer.invoke('resetDatabase', mode),

  getBudget: (monthKey) => ipcRenderer.invoke('getBudget', monthKey),
  setBudgetAmount: (categoryId, monthKey, amountCents) =>
    ipcRenderer.invoke('setBudgetAmount', categoryId, monthKey, amountCents),
  setBudgetDetails: (categoryId, monthKey, details, applyToFullYear) =>
    ipcRenderer.invoke(
      'setBudgetDetails',
      categoryId,
      monthKey,
      details,
      applyToFullYear
    ),

  getIncomeSources: () => ipcRenderer.invoke('getIncomeSources'),
  createIncomeSource: (payload) =>
    ipcRenderer.invoke('createIncomeSource', payload),
  setIncomeBudget: (sourceId, monthKey, amountCents) =>
    ipcRenderer.invoke('setIncomeBudget', sourceId, monthKey, amountCents),

  getTransactions: (filters) => ipcRenderer.invoke('getTransactions', filters),
  addTransaction: (payload) => ipcRenderer.invoke('addTransaction', payload),
  updateTransactionCategory: (id, categoryId) =>
    ipcRenderer.invoke('updateTransactionCategory', id, categoryId),
  deleteTransaction: (id) => ipcRenderer.invoke('deleteTransaction', id),
  deleteIncomeActual: (id) => ipcRenderer.invoke('deleteIncomeActual', id),

  openCSVDialog: () => ipcRenderer.invoke('openCSVDialog'),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  parseCSV: (filePath) => ipcRenderer.invoke('parseCSV', filePath),
  getCategoryMappings: () => ipcRenderer.invoke('getCategoryMappings'),
  saveCategoryMapping: (input) =>
    ipcRenderer.invoke('saveCategoryMapping', input),
  commitImport: (rows) => ipcRenderer.invoke('commitImport', rows),
  checkDuplicates: (hashes) => ipcRenderer.invoke('checkDuplicates', hashes),
  getMonthSpendingTotal: (monthKey) =>
    ipcRenderer.invoke('getMonthSpendingTotal', monthKey),

  getTrends: (range) => ipcRenderer.invoke('getTrends', range),
};

contextBridge.exposeInMainWorld('api', api);

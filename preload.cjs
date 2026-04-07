'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getGroups: () => ipcRenderer.invoke('getGroups'),
  createGroup: (payload) => ipcRenderer.invoke('createGroup', payload),
  createCategory: (payload) => ipcRenderer.invoke('createCategory', payload),
  deleteCategory: (id) => ipcRenderer.invoke('deleteCategory', id),
  deleteGroup: (id) => ipcRenderer.invoke('deleteGroup', id),

  getBudget: (monthKey) => ipcRenderer.invoke('getBudget', monthKey),
  setBudgetAmount: (categoryId, monthKey, amountCents) =>
    ipcRenderer.invoke('setBudgetAmount', categoryId, monthKey, amountCents),

  getIncomeSources: () => ipcRenderer.invoke('getIncomeSources'),
  createIncomeSource: (payload) =>
    ipcRenderer.invoke('createIncomeSource', payload),
  setIncomeBudget: (sourceId, monthKey, amountCents) =>
    ipcRenderer.invoke('setIncomeBudget', sourceId, monthKey, amountCents),

  getTransactions: (filters) => ipcRenderer.invoke('getTransactions', filters),
  addTransaction: (payload) => ipcRenderer.invoke('addTransaction', payload),
  importCSV: (filePath) => ipcRenderer.invoke('importCSV', filePath),
});

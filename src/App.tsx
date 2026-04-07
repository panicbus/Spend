import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { BudgetDashboard } from './components/Budget/BudgetDashboard';
import { TransactionList } from './components/Transactions/TransactionList';
import { ImportView } from './components/Import/ImportView';
import { SettingsPlaceholder } from './components/Settings/SettingsPlaceholder';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<BudgetDashboard />} />
          <Route path="/transactions" element={<TransactionList />} />
          <Route path="/import" element={<ImportView />} />
          <Route path="/settings" element={<SettingsPlaceholder />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

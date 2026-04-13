import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/Layout/AppShell';
import { BudgetDashboard } from './components/Budget/BudgetDashboard';
import { TransactionList } from './components/Transactions/TransactionList';
import { ImportView } from './components/Import/ImportView';
import { SettingsPage } from './components/Settings/SettingsPage';
import { TrendsPage } from './components/Trends/TrendsPage';

export default function App() {
  return (
    <div className="app-root">
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<BudgetDashboard />} />
            <Route path="/transactions" element={<TransactionList />} />
            <Route path="/trends" element={<TrendsPage />} />
            <Route path="/import" element={<ImportView />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </div>
  );
}

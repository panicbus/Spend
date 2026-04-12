import React from 'react';
import { Outlet } from 'react-router-dom';
import { LaunchMonthSync } from './LaunchMonthSync';
import { Sidebar } from './Sidebar';
import './AppShell.css';

export function AppShell() {
  return (
    <div className="app-shell">
      <LaunchMonthSync />
      <Sidebar />
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  );
}

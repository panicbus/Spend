import React from 'react';
import { Outlet } from 'react-router-dom';
import { OnboardingGate } from '../Onboarding/OnboardingGate';
import { LaunchMonthSync } from './LaunchMonthSync';
import { Sidebar } from './Sidebar';
import { ToastProvider } from '../common/Toast';
import './AppShell.css';

export function AppShell() {
  return (
    <ToastProvider>
      <OnboardingGate>
        <div className="app-shell">
          <LaunchMonthSync />
          <Sidebar />
          <main className="app-shell__main">
            <Outlet />
          </main>
        </div>
      </OnboardingGate>
    </ToastProvider>
  );
}

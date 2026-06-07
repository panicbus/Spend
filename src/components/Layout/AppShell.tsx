import React from 'react';
import { Outlet } from 'react-router-dom';
import { OnboardingGate } from '../Onboarding/OnboardingGate';
import { LaunchMonthSync } from './LaunchMonthSync';
import { Sidebar } from './Sidebar';
import './AppShell.css';

export function AppShell() {
  return (
    <OnboardingGate>
      <div className="app-shell">
        <LaunchMonthSync />
        <Sidebar />
        <main className="app-shell__main">
          <Outlet />
        </main>
      </div>
    </OnboardingGate>
  );
}

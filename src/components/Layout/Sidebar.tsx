import React from 'react';
import { NavLink } from 'react-router-dom';
import { useColorMode } from '../../theme/ColorModeContext';
import './Sidebar.css';

function IconBudget() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zm2 0v12h12V6H6zm2 2h8v2H8V8zm0 4h5v2H8v-2z"
      />
    </svg>
  );
}

/** Heroicons outline "arrows-right-left" (MIT) — money in / out, matches other stroke icons. */
function IconTransactions() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
      />
    </svg>
  );
}

/** Heroicons outline "chart-bar" (MIT) — reads clearly as analytics / trends. */
function IconTrends() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
      />
    </svg>
  );
}

function IconImport() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M11 16h2V7.83l3.59 3.58L18 10l-6-6-6 6 1.41 1.41L11 7.83V16zm-7 2v2h14v-2H4z"
      />
    </svg>
  );
}

/** Heroicons outline "cog-6-tooth" (MIT) — stroke matches Transactions / Trends. */
function IconSettings() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.99l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
      />
      <path
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

const appVersion = import.meta.env.VITE_APP_VERSION ?? '';

function IconSun() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fill="currentColor"
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
      />
    </svg>
  );
}

function SidebarThemeToggle() {
  const { colorMode, setColorMode } = useColorMode();
  const isDark = colorMode === 'dark';
  return (
    <div className="sidebar__theme">
      <button
        type="button"
        className="sidebar__theme-btn"
        onClick={() => setColorMode(isDark ? 'light' : 'dark')}
        aria-pressed={isDark}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <IconSun /> : <IconMoon />}
        <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__drag">
        <div className="sidebar__brand">
          <span className="sidebar__brand-mark" aria-hidden>
            <span className="sidebar__brand-text">Spend</span>
            <span className="sidebar__brand-dot">.</span>
          </span>
          {appVersion ? (
            <span
              className="sidebar__version"
              aria-label={`Version ${appVersion}`}
            >
              v{appVersion}
            </span>
          ) : null}
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="Primary">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
          }
        >
          <IconBudget />
          <span>Budget</span>
        </NavLink>
        <NavLink
          to="/transactions"
          className={({ isActive }) =>
            `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
          }
        >
          <IconTransactions />
          <span>Transactions</span>
        </NavLink>
        <NavLink
          to="/trends"
          className={({ isActive }) =>
            `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
          }
        >
          <IconTrends />
          <span>Trends</span>
        </NavLink>
        <NavLink
          to="/import"
          className={({ isActive }) =>
            `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
          }
        >
          <IconImport />
          <span>Import</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
          }
        >
          <IconSettings />
          <span>Settings</span>
        </NavLink>
      </nav>

      <div className="sidebar__spacer" />
      <SidebarThemeToggle />
    </aside>
  );
}

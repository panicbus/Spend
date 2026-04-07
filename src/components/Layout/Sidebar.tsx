import React from 'react';
import { NavLink } from 'react-router-dom';
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

function IconTransactions() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M7 4h10v2H7V4zm0 4h10v2H7V8zm0 4h7v2H7v-2zm-3 8 4-4H4v8h16v-4.5l-2 2V18H6.83L4 20.83V16z"
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

function IconSettings() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5m7.43-2.39.93.22a1 1 0 0 1 .76 1.21l-.32 1.45a1 1 0 0 1-1 .78l-.17.01a6.08 6.08 0 0 1-.67 1.64l.09.16a1 1 0 0 1-.26 1.28l-1.12 1.12a1 1 0 0 1-1.28.26l-.16-.09a6.09 6.09 0 0 1-1.64.67l-.01.17a1 1 0 0 1-.78 1l-1.45.32a1 1 0 0 1-1.21-.76l-.22-.93a6.06 6.06 0 0 1-2.1 0l-.22.93a1 1 0 0 1-1.21.76l-1.45-.32a1 1 0 0 1-.78-1l-.01-.17a6.09 6.09 0 0 1-1.64-.67l-.16.09a1 1 0 0 1-1.28-.26L3.68 18.1a1 1 0 0 1-.26-1.28l.09-.16A6.09 6.09 0 0 1 3.16 15l-.17-.01a1 1 0 0 1-.78-1l-.32-1.45a1 1 0 0 1 .76-1.21l.93-.22a6.06 6.06 0 0 1 0-2.1l-.93-.22a1 1 0 0 1-.76-1.21l.32-1.45a1 1 0 0 1 .78-1l.17-.01A6.09 6.09 0 0 1 4.9 4.26l-.09-.16a1 1 0 0 1 .26-1.28L7.9 1.68a1 1 0 0 1 1.28.26l.09.16a6.09 6.09 0 0 1 1.64-.67l.01-.17a1 1 0 0 1 .78-1l1.45-.32a1 1 0 0 1 1.21.76l.22.93a6.06 6.06 0 0 1 2.1 0l.22-.93a1 1 0 0 1 1.21-.76l1.45.32a1 1 0 0 1 .78 1l.01.17a6.09 6.09 0 0 1 1.64.67l.16-.09a1 1 0 0 1 1.28.26l1.12 1.12a1 1 0 0 1 .26 1.28l-.09.16a6.09 6.09 0 0 1 .67 1.64l.17.01a1 1 0 0 1 .78 1l.32 1.45a1 1 0 0 1-.76 1.21l-.93.22a6.06 6.06 0 0 1 0 2.1z"
      />
    </svg>
  );
}

const appVersion = import.meta.env.VITE_APP_VERSION ?? '';

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
    </aside>
  );
}

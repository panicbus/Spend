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

/** Receipt: stroke weight matches Budget; group scaled +25% from center. */
function IconTransactions() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="translate(12 12) scale(1.25) translate(-12 -12)">
        <path
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          d="M7.5 6.2Q7.5 4.35 9.35 4.35h5.3Q16.5 4.35 16.5 6.2v10.3l-1.35 2.45-1.3-2.45-1.35 2.45-1.3-2.45-1.35 2.45-1.3-2.45-1.35 2.45L7.5 16.5V6.2z"
        />
        <path
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          d="M9.15 8.35h5.7M9.15 10.85h5.7M9.15 13.35h4.1"
        />
      </g>
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

/** Filled gear: Rp−Rv = 4, ring (Rv−hole) = 4; center punched out; solid white. */
const ICON_SETTINGS_GEAR_D =
  'M8.939 4.609L9.061 1.319A1 1 0 0 0 10.061 0.356L13.939 0.356A1 1 0 0 0 14.939 1.319L15.061 4.609L17.474 2.369A1 1 0 0 0 18.861 2.395L21.605 5.139A1 1 0 0 0 21.631 6.526L19.391 8.939L22.681 9.061A1 1 0 0 0 23.644 10.061L23.644 13.939A1 1 0 0 0 22.681 14.939L19.391 15.061L21.631 17.474A1 1 0 0 0 21.605 18.861L18.861 21.605A1 1 0 0 0 17.474 21.631L15.061 19.391L14.939 22.681A1 1 0 0 0 13.939 23.644L10.061 23.644A1 1 0 0 0 9.061 22.681L8.939 19.391L6.526 21.631A1 1 0 0 0 5.139 21.605L2.395 18.861A1 1 0 0 0 2.369 17.474L4.609 15.061L1.319 14.939A1 1 0 0 0 0.356 13.939L0.356 10.061A1 1 0 0 0 1.319 9.061L4.609 8.939L2.369 6.526A1 1 0 0 0 2.395 5.139L5.139 2.395A1 1 0 0 0 6.526 2.369L8.939 4.609Z M12 5 A7 7 0 1 0 12 19 A7 7 0 1 0 12 5 Z';

function IconSettings() {
  return (
    <svg className="sidebar__icon" viewBox="0 0 24 24" aria-hidden>
      <path
        d={ICON_SETTINGS_GEAR_D}
        fill="#ffffff"
        fillRule="evenodd"
        clipRule="evenodd"
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

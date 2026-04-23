# Spend — architecture & product overview

This document describes what Spend does, how it is structured, and how data flows through the app. For the current semver, see `package.json`.

---

## What Spend is

**Spend** is a personal budgeting and spending **desktop app** built with **Electron**. The UI is **React 18** with **Vite**; routing uses **`react-router-dom`** with a **`HashRouter`**. All financial data lives in a local **SQLite** database accessed from the main process via **`better-sqlite3`**. Monetary values are stored as **integer cents** end-to-end.

---

## Architecture

| Layer | Role |
|--------|------|
| `main.ts` | Application window, SQLite file path, database reads/writes, IPC handlers |
| `preload.ts` | Exposes a typed **`SpendApi`** to the renderer through `contextBridge` and `ipcRenderer.invoke` |
| `src/services/api.ts` | Renderer-side wrapper around the preload bridge |
| `ipc-contract.ts` | Shared TypeScript types and the **`SpendApi`** method contract (preload, renderer, main) |
| Renderer (`src/`) | React pages composed under `AppShell` with sidebar navigation |

**Live updates:** The renderer dispatches a **`DATA_CHANGED_EVENT`** (see `src/utils/dataChanged.ts`) so views refetch after imports, edits, and other mutations.

**Theming:** **`ColorModeContext`** (`src/theme/`) drives light/dark mode; preference is persisted with other app settings.

---

## Data model (SQLite)

Schema source of truth: `database/schema.sql`.

| Table | Purpose |
|--------|---------|
| `category_groups` | Budget groups: name, color, sort order |
| `categories` | Line items under a group; budgets attach per category |
| `budgets` | Per category + `month_key` (`YYYY-MM`): amount, frequency (monthly / quarterly / yearly / bimonthly), optional annual amount |
| `income_sources` | Income buckets |
| `income_budgets` | Monthly budget amounts per income source |
| `transactions` | Expenses: date, merchant, amount, category, account / statement / notes, `source` (`manual` \| `csv`), `import_hash` for deduplication |
| `income_actuals` | Income lines tied to a source |
| `category_mappings` | CSV external category name → category, income source, or skip (Monarch-oriented `source` values) |
| `settings` | Key/value store (e.g. preferences) |
| `month_notes` | Free-text note per `month_key` |

Indexes support queries by month, category, and import hash.

---

## IPC surface (`SpendApi`)

The full method list and types live in **`ipc-contract.ts`**. Summary:

**Structure & settings**

- Groups and categories: create/update/delete, reorder, move categories between groups (with group deletion), delete previews
- Income sources: create/update/delete, reorder, delete previews
- Preferences: `defaultMonthOnLaunch` (`current` \| `last_viewed`), `colorMode` (`light` \| `dark`)
- Import mappings: list, save individual mapping, delete mapping row
- **Data:** export SQLite backup to disk, import backup (replace database), `resetDatabase('transactions' \| 'full')`

**Budget & income planning**

- `getBudget(monthKey)` — groups with budget lines (amounts, spent, frequency, rollups such as YTD / on-track style fields), plus income budget vs actual rows
- `setBudgetAmount`, `setBudgetDetails` (including optional apply-to-full-year for non-monthly frequencies)

**Activity**

- `getTransactions(filters)` — unified **expenses** and **`income_actuals`** with month, optional **date range**, category subset / all / none, search, and income-only drill filters (see `src/types/transactions.ts`)
- `addTransaction`, `updateTransactionCategory`, `deleteTransaction`, `deleteIncomeActual`

**CSV import**

- `openCSVDialog`, `parseCSV` (Monarch-style CSV → parsed rows + unknown category names)
- `getCategoryMappings`, `saveCategoryMapping`, `deleteCategoryMapping`
- `createCategoryForImport` — atomic create category (and optionally new group) from the import flow
- `commitImport`, `checkDuplicates`
- `getMonthSpendingTotal(monthKey)` — spending total aligned with budget “spent” basis

**Analytics & notes**

- `getTrends(range)` — `3m` \| `6m` \| `12m` \| `ytd` \| `all`; monthly snapshots; by group, category, income source, and income line buckets
- `getMerchantInsights(merchantName)` — aggregates and monthly series for a merchant
- `getMonthNote`, `setMonthNote`

---

## Routes & major features

| Route | Component | Highlights |
|--------|-----------|------------|
| `/` | `BudgetDashboard` | Month nav, summary cards, pulse checks, **spending donut** (allocation by budget group), **category grid**, income section, **month notes**, add-group / add-categories modals. Donut: tooltip on ring, legend label hover syncs slice highlight, click-through to transactions for that group/month with “Back to Budget”. |
| `/transactions` | `TransactionList` | Merged expense + income table; month or range; category filters; search; accordion row detail (notes, import date, recategorize, delete); note badge + tooltip; **merchant insights** when eligible; deep links via query params (`rangeFrom`/`rangeTo`, `category`, `categories`, `incomeSource`, `incomeLine`); “Back to Trends” / “Back to Budget”. |
| `/trends` | `TrendsPage` | Range presets, charts/tables, drill-down to transactions (clears budget return context when used), links to budget month where relevant, month notes where loaded. |
| `/import` | `ImportView` | CSV pick, parse, review rows, map unknowns, create category/group from import, duplicate checks, commit with detailed result counts. |
| `/settings` | `SettingsPage` | Categories & groups, income sources, import mappings, data export/import/reset, preferences (appearance, default month on launch). |

Shell: `AppShell` + `Sidebar` (`src/components/Layout/`).

---

## Cross-cutting behavior

- **Synced month:** `useSyncedMonthKey`, `src/utils/monthKeyStorage.ts`, and `MONTH_KEY_CHANGED_EVENT` keep Budget, Transactions, and other consumers aligned when the visible month changes.
- **Earliest data month:** `src/utils/dates.ts` clamps navigation (e.g. `EARLIEST_DATA_MONTH_KEY`) so users cannot scroll to empty history before real data.
- **Return navigation:** `src/utils/trendsReturnContext.ts` and `src/utils/budgetReturnContext.ts` (session storage + route `state`) power “Back to Trends” and “Back to Budget” from the transaction list.
- **Transaction deep links:** `useTransactionList` reads initial URL search params once; `TransactionList` applies them in a layout effect and then strips them from the URL while preserving router state.

---

## Build & packaging

- **Dev:** `npm run dev` — Vite + Electron, with main/preload watch scripts
- **Production build:** `npm run build` — Vite client build + TypeScript compile for main and preload
- **Native SQLite:** `better-sqlite3` rebuilt for Electron via `postinstall` / `electron-rebuild`
- **macOS packaging:** `electron-builder` targets in `package.json` (`pack:mac:*`, `dist:mac`)
- **Version bumps:** `npm run bump:patch|minor|major` updates `package.json` and `package-lock.json`

---

## Key source locations

| Area | Location |
|------|----------|
| IPC contract & shared domain types | `ipc-contract.ts`, `src/types/transactions.ts`, `src/types/import.ts` |
| Main process DB + handlers | `main.ts` |
| Preload bridge | `preload.ts` |
| Renderer API | `src/services/api.ts` |
| Budget UI | `src/components/Budget/` |
| Transactions UI | `src/components/Transactions/` |
| Trends UI | `src/components/Trends/` |
| Import UI | `src/components/Import/` |
| Settings UI | `src/components/Settings/SettingsPage.tsx` |
| App entry & routes | `src/App.tsx`, `src/main.tsx` (if present), `index.html` |

---

## One-line summary

Spend is a **local-first, SQLite-backed Electron app** that combines **monthly budgeting** (groups, category lines, frequencies, income budgets), a **unified transaction and income ledger**, **Monarch-oriented CSV import** with mappings and deduplication, **trends analytics with drill-through to the ledger**, **merchant insights**, **month notes**, and **settings** for structure, backups, and resets — with **shared month context**, **URL deep links**, and **return navigation** between Budget, Trends, and Transactions.

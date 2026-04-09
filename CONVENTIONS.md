# Spend. — Project Conventions

## Overview
"Spend." is a local-only Electron desktop budget tracker for macOS. It runs React (Vite) in the renderer process and better-sqlite3 in the main process. It tracks income and expenses by category with monthly budget targets, CSV import, and a polished interactive UI.

## Architecture

### Process Model
- **Main process** (`main.ts` → `dist-electron/main.js` via `tsc`): Electron window management, SQLite via better-sqlite3, IPC handlers. `package.json` `"main"` points at the compiled file.
- **Preload** (`preload.ts` → `dist-electron/preload.js`, CommonJS emit): `contextBridge.exposeInMainWorld('api', …)`. Renderer types for `window.api` live in `ipc-contract.ts` + `src/window.d.ts`.
- **Renderer** (`src/**/*.tsx`, `src/**/*.ts`): React + Vite. IPC only through `window.api` (see `src/services/api.ts`).

### Directory Structure
```
spend-app/
├── main.ts                    # Electron main (TypeScript source)
├── preload.ts                 # Preload bridge (TypeScript → CommonJS in dist-electron)
├── ipc-contract.ts            # SpendApi + re-exports domain types from src/types
├── src/types/
│   ├── import.ts              # CSV import / mapping types (MappingTargetType, ParsedRow, …)
│   └── api.ts                 # Re-exports SpendApi for renderer imports
├── vite.config.ts
├── tsconfig*.json
├── dist-electron/             # Compiled main + preload (gitignored)
├── database/
│   └── schema.sql             # SQLite schema (reference; applied at runtime from main)
├── src/
│   ├── App.tsx                # Router only (~30 lines max)
│   ├── main.tsx               # React entry (ReactDOM.createRoot)
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.tsx    # Nav sidebar (dark bg, fixed)
│   │   │   └── AppShell.tsx   # Sidebar + main content area wrapper
│   │   ├── Budget/
│   │   │   ├── BudgetDashboard.tsx  # Main budget view (summary + donut + categories + income)
│   │   │   ├── SummaryCards.tsx     # 4 metric cards at top
│   │   │   ├── SpendingDonut.tsx    # Donut chart + legend
│   │   │   ├── CategoryGrid.tsx    # 2-column grid of category cards
│   │   │   ├── CategoryCard.tsx    # Single expandable category card
│   │   │   └── IncomeSection.tsx   # Income rows
│   │   ├── Transactions/
│   │   │   └── TransactionList.tsx  # (Phase 2)
│   │   ├── Import/
│   │   │   └── ImportView.tsx       # CSV upload UI (Phase 2)
│   │   ├── Setup/
│   │   │   └── SetupWizard.tsx      # First-run onboarding (Phase 2)
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       └── ProgressBar.tsx   # (add when needed)
│   ├── hooks/
│   │   ├── useBudget.ts        # Fetch & mutate budget data for a given month
│   │   ├── useImport.ts        # CSV import state machine (discriminated union)
│   │   ├── useCategories.ts    # CRUD for categories
│   │   └── useTransactions.ts  # (Phase 2)
│   ├── services/
│   │   ├── api.ts              # Thin wrapper around window.api calls
│   │   └── formatters.ts       # Currency formatting, percentage calc
│   ├── utils/
│   │   └── dates.ts            # Month key generation, navigation helpers
│   └── styles/
│       ├── variables.css       # CSS custom properties (design tokens)
│       ├── reset.css           # Minimal CSS reset
│       └── global.css          # Base typography, body styles, imports variables + reset
├── public/
│   └── index.html
├── vite.config.ts
├── CONVENTIONS.md              # This file
└── package.json
```

## Design System

### Aesthetic
Refined minimalist with warmth. Flat surfaces, generous whitespace, no shadows or gradients. The sidebar is always dark (#1C1C1E). The main content area uses the light palette below.

### Fonts
- **Display/headings**: `'Playfair Display', serif` — weight 500 or 700
- **Body/UI**: `'DM Sans', sans-serif` — weights 300, 400, 500, 600
- Load from Google Fonts CDN in index.html

### Color Tokens (CSS Variables)
```css
--bg-app: #F6F5F0;
--bg-card: #FFFFFF;
--bg-card-alt: #FAFAF7;
--bg-sidebar: #1C1C1E;
--text-primary: #1A1A1A;
--text-secondary: #6B6B6B;
--text-tertiary: #9A9A9A;
--border: rgba(0,0,0,0.08);
--border-strong: rgba(0,0,0,0.15);
--accent: #2D9F75;
--accent-bg: #E8F5EE;
--accent-text: #1A7A56;
--danger: #D94F4F;
--danger-bg: #FDF0F0;
--danger-text: #A33333;
--warn: #E5953E;
--warn-bg: #FEF4E8;
--warn-text: #8C5A1E;
--bar-track: #EDEDEA;
```

### Category Colors (hardcoded per category group)
```
Housing:       #3A7BD5
Utilities:     #6B5CE7
Food:          #2D9F75
Transport:     #E5953E
Personal:      #D94F4F
Entertainment: #E76BAC
Gifts:         #9F6B2D
Savings:       #4FBCD9
```
These are stored in the DB alongside each category group. New groups pick from a palette.

### Component Patterns
- Cards: `background: var(--bg-card); border-radius: 12px; padding: 16px 18px; border: 0.5px solid var(--border);`
- Summary cards: `border-radius: 14px; padding: 20px;`
- Progress bars: 6px height, 3px border-radius, track uses `var(--bar-track)`. Fill color shifts to `var(--warn)` at 85% and `var(--danger)` at 100%+.
- Buttons (add): dashed border, transitions to accent on hover.
- Sidebar nav items: 8px border-radius, hover shows `rgba(255,255,255,0.06)` background.

### Interaction Patterns
- Category cards are clickable to expand/collapse and show line items.
- All budget amounts, category names, and line items are editable inline (Phase 2+).
- Month navigation via arrow buttons in the header.

## Database

### Engine
better-sqlite3 — synchronous, runs in Electron main process only. All queries happen in IPC handlers.

### Schema Principles
- `month_key` format: `"YYYY-MM"` (e.g. `"2026-04"`)
- Categories belong to category groups. Groups have a display color and sort order.
- Budget amounts are set per category per month.
- Transactions reference a category and have a date, description, and amount.
- All monetary values stored as integers (cents). Display divides by 100.

### Key Tables
- `category_groups` — id, name, color, sort_order
- `categories` — id, group_id (FK), name, sort_order
- `budgets` — id, category_id (FK), month_key, amount_cents
- `income_sources` — id, name, sort_order
- `income_budgets` — id, source_id (FK), month_key, amount_cents
- `transactions` — id, category_id (FK), date, description, amount_cents, source (manual|csv), import_hash (optional)
- `income_actuals` — imported income by source (date, amount_cents, import_hash)
- `category_mappings` — Monarch `external_name` → category, income_source, or skip

## IPC API Shape
All calls go through `window.api.*`:

```
// Categories & Groups
api.getGroups()                          → [{ id, name, color, sort_order, categories: [...] }]
api.createGroup({ name, color })         → { id }
api.createCategory({ group_id, name })   → { id }
api.deleteCategory(id)                   → void
api.deleteGroup(id)                      → void

// Budgets
api.getBudget(monthKey)                  → { groups: [...with budget amounts and spent totals], income: [...] }
api.setBudgetAmount(categoryId, monthKey, amountCents) → void

// Income
api.getIncomeSources()                   → [{ id, name }]
api.createIncomeSource({ name })         → { id }
api.setIncomeBudget(sourceId, monthKey, amountCents) → void

// Transactions
api.getTransactions(TransactionFilters) → TransactionListResult — use `categoryFilter`: `all` | `none` (hide all rows) | `subset` (+ `categoryIds`)
api.addTransaction({ category_id, date, description?, amount_cents }) → { id }
api.updateTransactionCategory(id, categoryId) → void
api.deleteTransaction(id) → void
api.deleteIncomeActual(id) → void

// Monarch CSV import (`src/types/import.ts`)
api.openCSVDialog() → string | null
api.getPathForFile(file) → path
api.parseCSV(filePath) → ParseCSVResult
api.getCategoryMappings() → CategoryMapping[]
api.saveCategoryMapping({ externalName, targetType, targetId }) → void
api.commitImport(CommitImportRow[]) → CommitImportResult
```

## Versioning (semver)
The sidebar shows **`package.json` `version`** (via `VITE_APP_VERSION` in `vite.config.ts`). Keep **`package-lock.json`** root `version` in sync (the bump scripts do both).

| Bump | When to use |
|------|-------------|
| **Minor** (`npm run bump:minor`) | Roadmap **phases** and other **new user-facing capabilities**: new screens/flows, new IPC endpoints, additive DB schema for features. Example: “Phase 3” slice shipped. |
| **Patch** (`npm run bump:patch`) | **Fixes** (bugs, crashes, incorrect totals), internal refactors, dependency bumps, styling/copy, tooling, docs—**no** new phase or headline capability. |
| **Major** (`npm run bump:major`) | **Breaking** changes: incompatible DB/IPC for existing installs, removed features, or a deliberate “2.0”/product reset. Rare—confirm with the maintainer first. |

After bumping, commit `package.json` and `package-lock.json` together.

## Rules
1. App.tsx must stay under 30 lines. It only contains router setup.
2. No inline styles in React components — use CSS modules or a shared stylesheet with CSS variables.
3. All monetary values are cents in the DB, dollars in the UI. Conversion happens in `formatters.ts`.
4. Every component that needs data uses a custom hook, never direct `window.api` calls in JSX.
5. Month resets: no rollover logic. Each month starts fresh budgets (copied from previous month's template on first access).
6. The app is single-user, local-only. No auth, no API keys, no network calls.
7. Sidebar is always dark; the main content area uses the light design tokens.

# Spend.

**Spend** is a desktop app for personal budgeting and day-to-day spending. You set monthly budgets by category, record or import transactions, and see how your money moves over time—all stored locally on your computer.

---

## What you can do

- **Budget** — Organize money into groups and categories, set amounts per month, and use frequencies (monthly, quarterly, and so on) where it helps. See spending vs budget, income you planned vs what came in, and optional notes for each month.
- **Transactions** — One list for expenses and income. Filter by month, category, or search. Expand a row to recategorize, read notes, or delete. Jump here from the budget or trends views and jump back when you’re done.
- **Trends** — Charts and summaries across recent months or year-to-date: spending by group and category, income by source, and ways to open the underlying transactions.
- **Import** — Bring in activity from a CSV (built around Monarch-style exports). Map bank categories to yours, remember those choices for next time, and skip duplicates when you re-import.
- **Settings** — Edit groups, categories, and income sources; manage import mappings; switch light or dark mode; choose whether the app opens on the current month or the last one you viewed; export or restore your database; reset data when you need a clean slate.

Your data lives in a **SQLite database** on your machine. There is no account or cloud requirement for normal use.

---

## Running from source

You need **Node.js** (LTS is fine) and **npm**.

```bash
npm install
npm run dev
```

That compiles the desktop shell, starts the dev server, and opens the Electron window.

Other useful commands:

| Command | What it does |
|--------|----------------|
| `npm run build` | Production build of the UI and main process |
| `npm start` | Build, then run the packaged app |
| `npm run typecheck` | Check TypeScript without starting the app |

Native SQLite is compiled for Electron during `npm install`. If that step fails after switching Node or Electron versions, try `npm run rebuild:sqlite`.

---

## Packaging (macOS)

The repo includes **electron-builder** scripts for Mac:

| Command | Purpose |
|--------|---------|
| `npm run pack:mac:arm64` | Unsigned `.app` in `release/mac-arm64/` (local testing) |
| `npm run dist:mac` | Signed, notarized `.dmg` + `.zip` for distribution |

**Signed release (`dist:mac`):** Requires a **Developer ID Application** cert in your login keychain, Xcode command line tools, and Apple notarization credentials. Copy `.env.build.example` to `.env.build` (gitignored) and set `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD`. The build signs with hardened runtime, submits to Apple’s notary service (often 2–15 minutes), then staples the ticket.

If codesign fails with **resource fork, Finder information, or similar detritus not allowed**, `npm run dist:mac` builds into `/var/tmp/spend-app-release` first (iCloud-synced `Documents` paths often break signing), then copies artifacts to `./release/`. The `afterPack` hook also strips extended attributes. Re-run after a failed attempt.

Verify after a release build:

```bash
codesign --verify --deep --strict release/mac-arm64/Spend.app
spctl --assess --type execute release/mac-arm64/Spend.app
```

---

## Technical overview

For a deeper description of how the app is put together (Electron, IPC, database tables, and APIs), see **[architecture.md](./architecture.md)**.

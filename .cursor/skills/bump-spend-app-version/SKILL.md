---
name: bump-spend-app-version
description: Bumps the Spend app release version so the UI sidebar, Electron metadata, and tooling stay in sync. Use when cutting a release, after the user asks to bump or tag a version, or when changing SemVer for spend-app.
---

# Bump Spend app version

## Single source of truth

The canonical version is **`package.json`** → **`"version"`** (SemVer: `MAJOR.MINOR.PATCH`).

Updating that one field is enough for:

| Surface | How it gets the version |
|--------|-------------------------|
| **Sidebar** (`Spend.` + `v0.1.0`) | Vite injects `import.meta.env.VITE_APP_VERSION` from `package.json` at dev/build time (`vite.config.js` `define`). |
| **Electron** (`app.getVersion()` when you add IPC/UI later) | Unpacked `electron .` reads version from `package.json`. |

Do **not** hardcode a version string in `Sidebar.jsx` or elsewhere.

## Steps (agent or human)

1. Edit **`package.json`** → set **`"version"`** to the new value (e.g. `0.2.0`).
2. Optionally run **`npm version patch`**, **`npm version minor`**, or **`npm version major`** instead of hand-editing (updates `package.json` and creates a git tag if the repo is git and the working tree is clean).
3. Restart **`npm run dev`** so Vite reloads config, or run **`npm run build`** so production assets embed the new value.
4. If you maintain a changelog, add an entry for that version (project convention — optional).

## Verification

- Sidebar shows **`v<version>`** next to the logo.
- From project root: `node -p "require('./package.json').version"` matches the UI.

## SemVer quick reference

- **PATCH** — bugfixes, no API/behavior change for users.
- **MINOR** — new features, backward compatible.
- **MAJOR** — breaking changes.

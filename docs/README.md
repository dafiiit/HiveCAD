# HiveCAD

HiveCAD is a modular CAD suite built with React, Three.js, Replicad, and Tauri. It supports a desktop application via Tauri and a web build via Vite.

This README is the single source of documentation for the repository.

## Table of Contents

- Overview
- Architecture
- Storage and Sync
- Extensions
- Local Development
- Scripts
- Release Process
- Repository Notes
- License

## Overview

HiveCAD focuses on a composable toolset and an extension-friendly architecture for CAD workflows. The app combines a React UI with a WASM-based CAD kernel and a desktop host when running via Tauri.

## Architecture

- **Frontend**: Vite + React for the UI, with Three.js / React Three Fiber for 3D rendering.
- **Desktop Host**: Tauri (Rust) provides native windowing, file system access, and OS integrations.
- **CAD Kernel**: Replicad (OpenCASCADE via WASM) performs geometry operations.

## Storage and Sync

Storage is managed by `StorageManager` in `src/lib/storage/StorageManager.ts`, which selects adapters by platform.

- **GitHubAdapter** (`src/lib/storage/adapters/GitHubAdapter.ts`): Primary cloud sync for the web build.
- **LocalGitAdapter** (`src/lib/storage/adapters/LocalGitAdapter.ts`): Default for desktop builds, storing projects in a local Git repository.
- **PublicAdapter** (`src/lib/storage/adapters/PublicAdapter.ts`): Read-only access to public examples.

Default selection behavior:

- Web builds initialize with the GitHub adapter.
- Desktop builds initialize with the Local Git adapter.

## Extensions

The extension system lives in `src/extensions`. A starting template is available in `src/extensions/_template`, and the extension guide is in `src/extensions/EXTENSION_GUIDE.md`.

## Local Development

### Prerequisites

- **Node.js**: CI builds use Node 20. Use the same version to match the release pipeline.
- **Rust**: Required for desktop builds (`npm run tauri:dev`).

### Install

```sh
npm install
```

### Run (Web)

```sh
npm run dev
```

### Run (Desktop)

```sh
npm run tauri:dev
```

### Environment Variables

Auth features use Supabase and expect the following variables at build time:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_REDIRECT_URL` (optional, defaults to the current origin; desktop builds typically use `hivecad://auth/callback`)

Example `.env`:

```ini
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AUTH_REDIRECT_URL=hivecad://auth/callback
```

## Scripts

Common scripts from `package.json`:

- `npm run dev`: Start the Vite dev server.
- `npm run build`: Build the default Vite bundle.
- `npm run build:web`: Build the web bundle explicitly.
- `npm run tauri:dev`: Run the desktop app in dev mode.
- `npm run tauri:build`: Build the desktop app.
- `npm run test`: Run the test suite once.
- `npm run lint`: Run ESLint.

## Release Process

Releases are automated by the GitHub Actions workflow in `.github/workflows/release.yml`.

1. Update versions in `package.json` and `src-tauri/tauri.conf.json`.
2. Create a tag that starts with `v` and push it:

```sh
git tag v0.1.3
git push origin v0.1.3
```

What happens next:

- The workflow creates a GitHub Release (non-draft).
- Tauri builds are produced for macOS, Windows, and Linux.
- The build artifacts are uploaded to the release.

The workflow expects these secrets in GitHub:

- `TAURI_PRIVATE_KEY`
- `TAURI_KEY_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Repository Notes

Additional design and engineering notes:

- `DESIGN.md`
- `EXTENSION_REFACTORING.md`
- `EXTENSION_VISIBILITY.md`

## License

MIT

# HiveCAD Offline Development Mode

## Overview

Offline development mode allows you to run and debug HiveCAD without requiring GitHub authentication or an internet connection. This is especially useful for rapid development and debugging when you don't need remote sync capabilities.

## Features

- **No Authentication Required**: Bypasses GitHub OAuth login completely
- **Mock User**: Uses a mock user (`offline@dev.local`) for all operations
- **Local Storage Only**: All projects and data are stored locally (IndexedDB or local Git)
- **No Remote Sync**: Remote storage and Supabase metadata services are disabled
- **Full Application Functionality**: Everything except cloud sync works normally

## Usage

### Quick Start

Run the offline development mode with:

```bash
npm run tauri:dev:offline
```

This command:
1. Copies `.env.offline` to `.env.local`
2. Launches Tauri in development mode
3. Automatically creates a mock user session

### Manual Setup

If you prefer to configure manually:

1. Copy `.env.offline` to `.env.local`:
   ```bash
   cp .env.offline .env.local
   ```

2. Run the normal dev command:
   ```bash
   npm run tauri:dev
   ```

## Configuration

The `.env.offline` file contains:

```ini
# Enable offline development mode
VITE_OFFLINE_MODE=true

# Placeholder Supabase credentials (not used in offline mode)
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder

# Auth redirect URL (not used in offline mode)
VITE_AUTH_REDIRECT_URL=hivecad://auth/callback
```

## How It Works

When `VITE_OFFLINE_MODE=true` is set:

1. **AuthGateway** creates a mock user instead of requiring authentication
2. **StorageManager** initializes only the local QuickStore (skips RemoteStore and SupabaseMeta)
3. **SyncEngine** is not initialized, preventing any background sync attempts
4. All UI features work normally, but remote sync features are disabled

## Limitations

- **No GitHub Sync**: Projects won't be pushed to or pulled from GitHub
- **No Supabase Metadata**: Project metadata, tags, and folders won't sync
- **Local Only**: All data exists only on your development machine
- **No Collaboration**: Can't share projects or see others' public projects

## Switching Back to Online Mode

To return to normal authenticated development:

1. Remove or rename `.env.local`:
   ```bash
   rm .env.local
   ```

2. Create a proper `.env` file with real Supabase credentials:
   ```ini
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_AUTH_REDIRECT_URL=hivecad://auth/callback
   ```

3. Run the normal dev command:
   ```bash
   npm run tauri:dev
   ```

## Use Cases

Offline mode is perfect for:

- **Quick Debugging**: Test features without authentication overhead
- **Offline Development**: Work without an internet connection
- **Local Testing**: Test storage and UI changes in isolation
- **CI/CD**: Run tests in environments without Supabase access
- **New Developer Onboarding**: Get started without setting up external services

## Technical Details

### Mock User

The offline mock user has these properties:

```typescript
{
  id: 'offline-dev-user',
  email: 'offline@dev.local',
  pat: null // No GitHub PAT
}
```

### Storage Behavior

- **Desktop**: Uses `LocalGitQuickStore` (Git-based local storage)
- **Web**: Uses `IdbQuickStore` (IndexedDB)
- **Remote**: Not initialized
- **Meta**: Not initialized
- **Sync**: Not initialized

### Code Paths

Key files that handle offline mode:

- [src/components/auth/AuthGateway.tsx](../src/components/auth/AuthGateway.tsx) - Skips authentication
- [src/lib/storage/StorageManager.ts](../src/lib/storage/StorageManager.ts) - Skips remote/meta/sync initialization
- [.env.offline](../.env.offline) - Offline configuration

## Troubleshooting

### "Still seeing login screen"

Ensure `.env.local` exists with `VITE_OFFLINE_MODE=true`. Restart the dev server after creating it.

### "Projects not persisting"

Check browser console for storage errors. IndexedDB should work in offline mode.

### "Switching back to online mode doesn't work"

Delete `.env.local` completely and ensure your `.env` file has valid Supabase credentials.

## See Also

- [README.md](./README.md) - General development guide
- [ARCHITECTURE.md](./architecture/ARCHITECTURE.md) - Storage architecture details

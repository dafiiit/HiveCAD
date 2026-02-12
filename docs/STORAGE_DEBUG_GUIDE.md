# HiveCAD Storage Debugging Guide

This guide helps you diagnose and fix persistent storage issues where data reappears after deletion.

## The Problem

HiveCAD stores data in **multiple locations**:
1. **IndexedDB** (local browser database) - via IdbQuickStore
2. **localStorage** (browser key-value store) - for thumbnails, settings, PAT
3. **GitHub** (remote repository) - for durable cloud backup
4. **Supabase** (database) - for metadata, sharing, discovery

When you delete data from one location but not others, the **SyncEngine** can re-sync it back from the remaining locations

## Symptoms

- Data persists after deleting GitHub repo/Supabase entries
- Old projects reappear after creating new ones
- Delete/reset operations don't fully work
- Browser refresh brings back deleted data

## Root Causes

1. **IndexedDB not cleared** - Most common cause
2. **localStorage not cleared** - Contains thumbnails and cached data
3. **SyncEngine re-pulling data** - Syncs from any remaining data sources
4. **Browser cache** - Service workers or cache serving stale data
5. **Partial deletions** - Only some storage layers were cleared

## Diagnosis

### Option 1: Browser Console (Quick)

Open the browser console (F12) and run:

```javascript
// Check what's stored
await window.__hiveDebug.inspectAllStorage()
```

This shows you exactly where data is persisting:
- IndexedDB keys and projects
- localStorage HiveCAD-related keys
- QuickStore projects
- RemoteStore (GitHub) connection and projects
- Supabase userId and projects

### Option 2: Manual Inspection

1. **IndexedDB**:
   - Chrome DevTools → Application tab → IndexedDB → keyval-store
   - Look for keys starting with `hive:`

2. **localStorage**:
   - Chrome DevTools → Application tab → Local Storage
   - Look for keys containing `hivecad`, `hive:`, or `github_pat`

3. **GitHub**:
   - Go to your GitHub profile → Repositories
   - Find the `hivecad` repository
   - Check `hivecad/` directory for project files

4. **Supabase**:
   - Go to your Supabase project dashboard
   - Table Editor → `projects` table
   - Check for entries with your user_id

## Solutions

### Solution 1: Use the Built-in Reset (Recommended)

1. Open HiveCAD
2. Click your profile icon → Settings
3. Click "Reset All Data"
4. Confirm the operation
5. **Disconnect GitHub integration** (if asked to reconnect, DON'T do it yet)
6. Close the browser tab completely
7. Clear browser cache: Chrome → ⋮ → More Tools → Clear Browsing Data → Cached images and files
8. Reopen HiveCAD in a new tab

### Solution 2: Nuclear Option (Browser Console)

If the built-in reset doesn't work, use the nuclear option:

```javascript
// Clear EVERYTHING (local + remote + Supabase)
await window.__hiveDebug.clearAllHiveCADData()
```

Options:
```javascript
// Clear everything including non-HiveCAD localStorage
await window.__hiveDebug.clearAllHiveCADData({
    clearLocalStorageCompletely: true,
    clearRemote: true,
    clearSupabase: true
})

// Clear only local caches (keep GitHub/Supabase)
await window.__hiveDebug.clearLocalCachesOnly()
```

After running this:
1. Close all HiveCAD tabs
2. Clear browser cache
3. Reopen HiveCAD

### Solution 3: Manual Cleanup

If you need complete control:

#### Step 1: Clear IndexedDB
```javascript
// In browser console
indexedDB.deleteDatabase('keyval-store');
```

#### Step 2: Clear localStorage
```javascript
// Remove HiveCAD keys only
Object.keys(localStorage)
    .filter(k => k.includes('hivecad') || k.includes('hive:') || k === 'github_pat')
    .forEach(k => localStorage.removeItem(k));

// OR clear everything
localStorage.clear();
```

#### Step 3: Delete GitHub repository
1. Go to GitHub → Your repositories
2. Find `hivecad` repo
3. Settings → Delete this repository

#### Step 4: Clear Supabase data
1. Go to Supabase project
2. Table Editor → `projects` table
3. Delete all rows with your user_id
4. Repeat for `user_tags`, `user_folders`, `extensions`, `extension_votes` tables

#### Step 5: Clear browser cache
Chrome → ⋮ → More Tools → Clear Browsing Data

#### Step 6: Restart
Close all HiveCAD tabs and reopen

## Preventing Future Issues

### Best Practices

1. **Use the built-in reset** - It now clears all storage layers properly
2. **Disconnect GitHub before major operations** - Prevents automatic sync during cleanup
3. **Wait for operations to complete** - Don't refresh during delete operations
4. **Clear browser cache regularly** - Especially after major data operations

### Understanding the SyncEngine

The SyncEngine syncs data every 30 seconds (on web). It:
1. Pushes local projects to GitHub + Supabase
2. Pulls remote projects that aren't local

**Problem**: If you delete GitHub but IndexedDB still has data, it re-pushes it to GitHub.  
**Solution**: Always clear local storage (IndexedDB) first, THEN disconnect GitHub.

### Proper Reset Procedure

1. **Suspend sync**: Click profile → Settings → Disconnect GitHub
2. **Clear local**: Use "Reset All Data" or `clearLocalCachesOnly()`
3. **Clear remote**: Delete GitHub repo manually or use `clearAllHiveCADData()`
4. **Clear Supabase**: Automatic with "Reset All Data"
5. **Verify**: Run `inspectAllStorage()` to confirm everything is gone
6. **Restart**: Close tab, clear cache, reopen
7. **Reconnect**: Only now reconnect GitHub if desired

## Testing Your Fix

After clearing storage:

```javascript
// Verify everything is gone
const inspection = await window.__hiveDebug.inspectAllStorage();

// Should show:
// - indexedDB.keys: [] (empty)
// - localStorage.hivecadKeys: [] (empty)
// - quickStore.projects: [] (empty)
// - remoteStore.projects: [] or undefined (if not connected)
// - supabase.projects: [] or undefined
```

If any arrays have entries, that data is still persisting.

## Common Questions

### Q: Why does data reappear after I create a new project?

**A**: The SyncEngine is pulling old data from GitHub or Supabase. You didn't fully clear all storage layers.

**Fix**: Use the nuclear option to clear all layers, then reconnect GitHub only after verification.

### Q: I deleted the GitHub directory but data still shows

**A**: The data is in IndexedDB (local storage) and will be re-pushed to GitHub by the SyncEngine.

**Fix**: Clear IndexedDB first using `clearLocalCachesOnly()`.

### Q: Reset button doesn't work

**A**: Possible causes:
- SyncEngine is suspended but data wasn't fully deleted
- Browser cache is serving stale UI
- JavaScript errors during reset (check console)

**Fix**: Use the nuclear option, clear browser cache, restart.

### Q: Can I keep some projects but delete others?

**A**: Yes, use the individual project delete feature:
1. Open Project Dashboard
2. Find project → ⋮ menu → Delete
3. Confirm deletion
4. Wait for sync to complete (check sync status icon)

Note: Currently this may not work properly due to the storage bugs being fixed.

## Advanced: Check Sync Status

```javascript
const mgr = await import('@/lib/storage/StorageManager').then(m => m.StorageManager.getInstance());
console.log('Sync state:', mgr.syncEngine?.getState());

// Watch sync state changes
mgr.syncEngine?.subscribe(state => {
    console.log('Sync state changed:', state);
});
```

## Changes Made

The following improvements were made to fix storage issues:

1. **Added `clearAll()` method** to both `IdbQuickStore` and `LocalGitQuickStore`
   - Completely clears all HiveCAD data from IndexedDB
   - More thorough than deleting projects one by one

2. **Improved `resetAll()` in `StorageManager`**
   - Now uses `clearAll()` instead of deleting projects individually
   - Clears localStorage HiveCAD keys
   - Adds verification step to confirm deletion
   - Does NOT resume sync after reset (prevents re-population)
   - Better error handling and progress reporting

3. **Created debug tools** (`src/lib/storage/debug.ts`)
   - `inspectAllStorage()` - See what's stored where
   - `clearAllHiveCADData()` - Nuclear option to clear everything
   - `clearLocalCachesOnly()` - Clear local without touching remote

4. **Auto-loaded on window** - Debug tools available as `window.__hiveDebug` in console

## Contributing

If you find additional storage issues or edge cases, please:

1. Run `inspectAllStorage()` before and after the issue
2. Document the exact steps to reproduce
3. Include console logs
4. File an issue with the debug output

## See Also

- [Architecture: Storage System](./architecture/ARCHITECTURE.md#9-store-architecture)
- [Storage Types](../src/lib/storage/types.ts)
- [Storage Manager](../src/lib/storage/StorageManager.ts)

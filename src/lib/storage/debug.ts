/**
 * Storage debugging utilities
 * 
 * Available in the browser console via: window.__hiveDebug
 * 
 *   await window.__hiveDebug.inspectAllStorage()    // See what's stored where
 *   await window.__hiveDebug.clearAllHiveCADData()  // Nuclear option: clear everything
 *   await window.__hiveDebug.forceSyncNow()         // Trigger sync immediately
 */

import { get, keys, del, clear as clearIdb } from 'idb-keyval';
import { StorageManager } from './StorageManager';
import type { IdbQuickStore } from './quick/IdbQuickStore';

export interface StorageInspection {
    indexedDB: {
        keys: string[];
        count: number;
        tombstones: string[];
    };
    localStorage: {
        keys: string[];
        hivecadKeys: string[];
        thumbnails: Record<string, string>;
        exampleOpens: Record<string, number>;
        pat: string | null;
    };
    quickStore: {
        projects: Array<{ id: string; name: string; lastModified: number }>;
    };
    remoteStore: {
        connected: boolean;
        projects?: Array<{ id: string; name: string }>;
    };
    supabase: {
        userId: string | null;
        projects?: Array<{ id: string; name: string }>;
    };
    sync: {
        status: string;
        lastSyncTime: number | null;
        hasPendingChanges: boolean;
    };
}

/**
 * Inspect all storage locations to see where data persists
 */
export async function inspectAllStorage(): Promise<StorageInspection> {
    const mgr = StorageManager.getInstance();
    
    // 1. IndexedDB raw keys
    const idbKeys = await keys();
    const idbKeyStrings = idbKeys.map(k => String(k));
    const tombstoneKeys = idbKeyStrings.filter(k => k.startsWith('hive:tombstone:'));
    
    // 2. localStorage
    const lsKeys = Object.keys(localStorage);
    const hivecadLSKeys = lsKeys.filter(k => 
        k.includes('hivecad') || k.includes('hive:') || k.includes('supabase')
    );
    
    let thumbnails = {};
    let exampleOpens = {};
    try {
        thumbnails = JSON.parse(localStorage.getItem('hivecad_thumbnails') || '{}');
    } catch {}
    try {
        exampleOpens = JSON.parse(localStorage.getItem('hivecad_example_opens') || '{}');
    } catch {}
    
    const pat = localStorage.getItem('github_pat');
    
    // 3. QuickStore projects + tombstones
    let quickProjects: any[] = [];
    try {
        if (mgr.isInitialized) {
            const metas = await mgr.quickStore.listProjects();
            quickProjects = metas.map(m => ({
                id: m.id,
                name: m.name,
                lastModified: m.lastModified,
            }));
        }
    } catch (e) {
        console.warn('Failed to list QuickStore projects:', e);
    }
    
    // 4. Remote store
    let remoteConnected = false;
    let remoteProjects: any[] | undefined = undefined;
    try {
        if (mgr.isInitialized && mgr.remoteStore) {
            remoteConnected = mgr.remoteStore.isConnected();
            if (remoteConnected) {
                const metas = await mgr.remoteStore.pullAllProjectMetas();
                remoteProjects = metas.map(m => ({ id: m.id, name: m.name }));
            }
        }
    } catch (e) {
        console.warn('Failed to inspect remote store:', e);
    }
    
    // 5. Supabase — not critical, just report what we can
    const userId: string | null = null;
    const supabaseProjects: any[] | undefined = undefined;
    
    // 6. Sync state
    let syncStatus = 'unknown';
    let lastSyncTime: number | null = null;
    let hasPendingChanges = false;
    try {
        if (mgr.isInitialized && mgr.syncEngine) {
            const state = mgr.syncEngine.getState();
            syncStatus = state.status;
            lastSyncTime = state.lastSyncTime;
            hasPendingChanges = state.hasPendingChanges;
        }
    } catch {}
    
    const inspection: StorageInspection = {
        indexedDB: {
            keys: idbKeyStrings,
            count: idbKeyStrings.length,
            tombstones: tombstoneKeys,
        },
        localStorage: {
            keys: lsKeys,
            hivecadKeys: hivecadLSKeys,
            thumbnails,
            exampleOpens,
            pat,
        },
        quickStore: {
            projects: quickProjects,
        },
        remoteStore: {
            connected: remoteConnected,
            projects: remoteProjects,
        },
        supabase: {
            userId,
            projects: supabaseProjects,
        },
        sync: {
            status: syncStatus,
            lastSyncTime,
            hasPendingChanges,
        },
    };
    
    console.log('=== Storage Inspection ===');
    console.log('IndexedDB keys:', inspection.indexedDB.keys);
    console.log('Tombstones:', inspection.indexedDB.tombstones);
    console.log('localStorage HiveCAD keys:', inspection.localStorage.hivecadKeys);
    console.log('QuickStore projects:', inspection.quickStore.projects);
    console.log('RemoteStore connected:', inspection.remoteStore.connected);
    console.log('RemoteStore projects:', inspection.remoteStore.projects);
    console.log('Sync state:', inspection.sync);
    console.log('=========================');
    
    return inspection;
}

/**
 * Nuclear option: Clear ALL HiveCAD data from all storage locations.
 * Clears IndexedDB (including tombstones), localStorage, remote, and Supabase.
 */
export async function clearAllHiveCADData(options?: {
    clearLocalStorageCompletely?: boolean;
    clearRemote?: boolean;
    clearSupabase?: boolean;
}): Promise<void> {
    const {
        clearLocalStorageCompletely = false,
        clearRemote = true,
        clearSupabase = true,
    } = options || {};
    
    console.log('[Debug] Starting nuclear clear of all HiveCAD data...');
    
    const mgr = StorageManager.getInstance();

    // Suspend sync to prevent re-population during clearing
    mgr.syncEngine?.suspend();
    
    // 1. Clear IndexedDB completely (including tombstones)
    console.log('[Debug] Clearing IndexedDB...');
    try {
        await clearIdb();
        console.log('[Debug] IndexedDB cleared');
    } catch (e) {
        console.error('[Debug] Failed to clear IndexedDB:', e);
    }
    
    // 2. Clear localStorage
    console.log('[Debug] Clearing localStorage...');
    if (clearLocalStorageCompletely) {
        localStorage.clear();
        console.log('[Debug] localStorage completely cleared');
    } else {
        // Only clear HiveCAD-related keys
        const keysToRemove = Object.keys(localStorage).filter(k =>
            k.includes('hivecad') || k.includes('hive:') || k.startsWith('github_pat')
        );
        keysToRemove.forEach(k => localStorage.removeItem(k));
        console.log('[Debug] Removed HiveCAD localStorage keys:', keysToRemove);
    }
    
    // 3. Clear RemoteStore (if connected and requested)
    if (clearRemote && mgr.isInitialized && mgr.remoteStore?.isConnected()) {
        console.log('[Debug] Clearing RemoteStore...');
        try {
            await mgr.remoteStore.resetRepository();
            console.log('[Debug] RemoteStore cleared');
        } catch (e) {
            console.error('[Debug] Failed to clear RemoteStore:', e);
        }
    }
    
    // 4. Clear Supabase (if requested)
    if (clearSupabase && mgr.isInitialized && mgr.supabaseMeta) {
        console.log('[Debug] Clearing Supabase user data...');
        try {
            // Try to get userId from various sources
            let userId: string | null = null;
            try {
                const lsKeys = Object.keys(localStorage);
                for (const key of lsKeys) {
                    if (key.includes('supabase') && key.includes('auth')) {
                        const val = localStorage.getItem(key);
                        if (val) {
                            const parsed = JSON.parse(val);
                            userId = parsed?.user?.id || parsed?.currentSession?.user?.id || null;
                            if (userId) break;
                        }
                    }
                }
            } catch {}
            
            if (userId) {
                await mgr.supabaseMeta.resetAllUserData(userId);
                console.log('[Debug] Supabase user data cleared');
            } else {
                console.log('[Debug] No Supabase userId found, skipping');
            }
        } catch (e) {
            console.error('[Debug] Failed to clear Supabase:', e);
        }
    }
    
    console.log('[Debug] Nuclear clear complete. Reload the page to see results.');
}

/**
 * Clear just the local caches (IndexedDB + localStorage) without touching remote
 */
export async function clearLocalCachesOnly(): Promise<void> {
    console.log('[Debug] Clearing local caches only...');
    
    const mgr = StorageManager.getInstance();
    mgr.syncEngine?.suspend();
    
    // Clear IndexedDB
    try {
        await clearIdb();
        console.log('[Debug] IndexedDB cleared');
    } catch (e) {
        console.error('[Debug] Failed to clear IndexedDB:', e);
    }
    
    // Clear HiveCAD localStorage keys
    const keysToRemove = Object.keys(localStorage).filter(k =>
        k.includes('hivecad') || k.includes('hive:')
    );
    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.log('[Debug] Removed localStorage keys:', keysToRemove);
    
    console.log('[Debug] Local caches cleared. Reload the page.');
}

/**
 * Force a sync cycle immediately (useful for testing)
 */
export async function forceSyncNow(): Promise<void> {
    const mgr = StorageManager.getInstance();
    if (!mgr.isInitialized) {
        console.error('[Debug] StorageManager not initialized');
        return;
    }
    if (!mgr.syncEngine) {
        console.error('[Debug] No SyncEngine available');
        return;
    }
    console.log('[Debug] Triggering manual sync...');
    await mgr.syncEngine.syncNow();
    console.log('[Debug] Sync complete. State:', mgr.syncEngine.getState());
}

// Make functions available on window for easy console access
if (typeof window !== 'undefined') {
    (window as any).__hiveDebug = {
        inspectAllStorage,
        clearAllHiveCADData,
        clearLocalCachesOnly,
        forceSyncNow,
    };
    console.log('HiveCAD debug tools loaded. Access via: window.__hiveDebug');
}

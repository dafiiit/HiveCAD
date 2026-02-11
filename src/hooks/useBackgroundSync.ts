/**
 * useBackgroundSync — starts/stops the SyncEngine auto-sync
 * when the component mounts/unmounts.
 *
 * Web: auto-syncs every 30 s.
 * Desktop: no auto-sync (the user triggers manually).
 */
import { useEffect } from 'react';
import { StorageManager } from '@/lib/storage/StorageManager';
import { isDesktop } from '@/lib/platform/platform';

export function useBackgroundSync() {
    useEffect(() => {
        const mgr = StorageManager.getInstance();
        if (!mgr.isInitialized) return;

        // Only auto-sync on web
        if (!isDesktop()) {
            mgr.syncEngine?.startAutoSync(30_000);
        }

        return () => {
            mgr.syncEngine?.stopAutoSync();
        };
    }, []);
}

/**
 * useUnsavedChangesWarning — warns users before they close the tab
 * if there are unsaved/unsynced changes.
 *
 * The message clearly states whether closing will result in data loss:
 *   • Desktop: never loses data (local git commits instantly).
 *   • Web: loses data if QuickStore has pending changes not yet synced.
 */
import { useEffect } from 'react';
import { useCADStore } from './useCADStore';
import { StorageManager } from '@/lib/storage/StorageManager';
import { isDesktop } from '@/lib/platform/platform';

export function useUnsavedChangesWarning() {
    const isSaved = useCADStore((s) => s.isSaved);

    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDesktop()) {
                // Desktop: local git is always up to date — no data loss
                return;
            }

            const mgr = StorageManager.getInstance();
            const syncState = mgr.syncEngine?.getState();

            // Only warn if there are ACTUAL pending changes that would be lost
            if (!isSaved || syncState?.wouldLoseData) {
                const message = syncState?.hasPendingChanges
                    ? 'You have unsynced changes. Closing now WILL lose data. Please sync first.'
                    : 'You have unsaved changes.';
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        };

        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isSaved]);
}

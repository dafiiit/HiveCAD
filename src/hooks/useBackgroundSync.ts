import { useEffect } from 'react';
import { useCADStore } from '@/hooks/useCADStore';

const SYNC_INTERVAL = 30 * 1000; // 30 seconds

export function useBackgroundSync() {
    const { hasUnpushedChanges, syncToCloud, isSaving, pendingSave } = useCADStore();

    useEffect(() => {
        if (!hasUnpushedChanges) return;

        const interval = setInterval(() => {
            if (!isSaving && !pendingSave) {
                console.log('[BackgoundSync] Triggering background sync...');
                syncToCloud();
            }
        }, SYNC_INTERVAL);

        return () => clearInterval(interval);
    }, [hasUnpushedChanges, isSaving, pendingSave, syncToCloud]);
}

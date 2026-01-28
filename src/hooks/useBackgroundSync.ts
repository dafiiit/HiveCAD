import { useEffect } from 'react';
import { useCADStore } from '@/hooks/useCADStore';

const SYNC_INTERVAL = 30 * 1000; // 30 seconds

export function useBackgroundSync() {
    const { fileName, projectId, hasUnpushedChanges, syncToCloud, isSaving, pendingSave } = useCADStore((state) => ({
        fileName: state.fileName,
        projectId: state.projectId,
        hasUnpushedChanges: state.hasUnpushedChanges,
        syncToCloud: state.syncToCloud,
        isSaving: state.isSaving,
        pendingSave: state.pendingSave
    }));

    useEffect(() => {
        const interval = setInterval(() => {
            // Use the latest values from the hook's state
            if (fileName === 'Untitled' || !projectId) {
                // Skip sync if project is still "Untitled" or has no ID
                return;
            }

            if (hasUnpushedChanges && !isSaving && !pendingSave) {
                console.log(`[BackgroundSync] Syncing ${fileName} (${projectId})`);
                syncToCloud();
            }
        }, SYNC_INTERVAL);

        return () => clearInterval(interval);
    }, [fileName, projectId, hasUnpushedChanges, isSaving, pendingSave, syncToCloud]);
}

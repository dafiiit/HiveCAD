import { useEffect } from 'react';
import { useCADStore } from './useCADStore';

export function useUnsavedChangesWarning() {
    const hasUnpushedChanges = useCADStore(state => state.hasUnpushedChanges);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnpushedChanges) {
                const message = 'You have unsaved changes that have not been pushed to the cloud yet. Are you sure you want to leave?';
                e.preventDefault();
                e.returnValue = message;
                return message;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [hasUnpushedChanges]);
}

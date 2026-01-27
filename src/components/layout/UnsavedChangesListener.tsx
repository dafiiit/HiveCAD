import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';

export const UnsavedChangesListener = () => {
    useUnsavedChangesWarning();
    return null;
};

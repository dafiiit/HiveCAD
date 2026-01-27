import React, { useEffect } from 'react';
// import { useCADStore, useCADStoreApi } from '@/hooks/useCADStore'; // Removed
import { useGlobalStore } from '@/store/useGlobalStore';
import { AuthDialog } from './AuthDialog';
import { ProjectDashboard } from '../project/ProjectDashboard';
import { GitHubTokenDialog } from '../ui/GitHubTokenDialog';

export function AuthGateway({ children }: { children: React.ReactNode }) {
    const { user, loadSession, authLoaded, isAutosaveEnabled, showPATDialog, setShowPATDialog } = useGlobalStore();


    useEffect(() => {
        const initSession = async () => {
            await loadSession();
        };
        initSession();
    }, [loadSession]);

    // Auto-connect to Storage if PAT is present
    useEffect(() => {
        const connectStorage = async () => {
            if (user?.pat && user.pat.trim() !== '') {
                const { StorageManager } = await import('@/lib/storage/StorageManager');
                const githubAdapter = StorageManager.getInstance().getAdapter('github');
                if (githubAdapter && !githubAdapter.isAuthenticated()) {
                    console.log('[AuthGateway] Auto-connecting GitHub storage with PAT...');
                    const success = await githubAdapter.connect(user.pat);
                    if (success) {
                        console.log('[AuthGateway] GitHub storage connected successfully.');
                        useGlobalStore.getState().setStorageConnected(true);
                    } else {
                        console.error('[AuthGateway] GitHub storage connection failed.');
                        useGlobalStore.getState().setStorageConnected(false);
                    }
                }
            } else {
                console.log('[AuthGateway] No PAT found for user, skipped cloud connection.');
                useGlobalStore.getState().setStorageConnected(false);
            }
        };
        if (authLoaded && user) connectStorage();
    }, [authLoaded, user]);

    // Show nothing while loading session
    if (!authLoaded) return null;

    // If no user, show AuthDialog
    if (!user) {
        return <AuthDialog />;
    }

    return (
        <>
            {children}
            <GitHubTokenDialog
                open={showPATDialog}
                onOpenChange={setShowPATDialog}
                mode="create"
            />
        </>
    );
}

import React, { useEffect } from 'react';
import { useCADStore } from '@/hooks/useCADStore';
import { AuthDialog } from './AuthDialog';
import { ProjectDashboard } from '../project/ProjectDashboard';
import { GitHubTokenDialog } from '../ui/GitHubTokenDialog';

export function AuthGateway({ children }: { children: React.ReactNode }) {
    const { user, fileName, loadSession, authLoaded, isAutosaveEnabled, save, code, objects, showPATDialog, setShowPATDialog } = useCADStore();

    useEffect(() => {
        loadSession();
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
                        useCADStore.getState().setStorageConnected(true);
                    } else {
                        console.error('[AuthGateway] GitHub storage connection failed.');
                        useCADStore.getState().setStorageConnected(false);
                    }
                }
            } else {
                console.log('[AuthGateway] No PAT found for user, skipped cloud connection.');
                useCADStore.getState().setStorageConnected(false);
            }
        };
        if (authLoaded && user) connectStorage();
    }, [authLoaded, user]);

    // Autosave effect
    useEffect(() => {
        if (isAutosaveEnabled && user && fileName !== 'Untitled') {
            const timeout = setTimeout(() => {
                save();
            }, 2000); // 2 second debounce
            return () => clearTimeout(timeout);
        }
    }, [code, objects, isAutosaveEnabled, user, fileName, save]);

    // Show nothing while loading session
    if (!authLoaded) return null;

    // If no user, show AuthDialog
    if (!user) {
        return <AuthDialog />;
    }

    // Determine what to render based on fileName
    const content = fileName === 'Untitled' ? <ProjectDashboard /> : children;

    return (
        <>
            {content}
            <GitHubTokenDialog
                open={showPATDialog}
                onOpenChange={setShowPATDialog}
                mode="create"
            />
        </>
    );
}

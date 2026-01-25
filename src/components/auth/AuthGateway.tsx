import React, { useEffect } from 'react';
import { useCADStore } from '@/hooks/useCADStore';
import { AuthDialog } from './AuthDialog';
import { ProjectDashboard } from '../project/ProjectDashboard';

export function AuthGateway({ children }: { children: React.ReactNode }) {
    const { user, fileName, loadSession, authLoaded, isAutosaveEnabled, save, code, objects } = useCADStore();

    useEffect(() => {
        loadSession();
    }, [loadSession]);

    // Auto-connect to Storage if PAT is present
    useEffect(() => {
        const connectStorage = async () => {
            if (user?.pat) {
                const { StorageManager } = await import('@/lib/storage/StorageManager');
                const githubAdapter = StorageManager.getInstance().getAdapter('github');
                if (githubAdapter && !githubAdapter.isAuthenticated()) {
                    console.log('[AuthGateway] Auto-connecting GitHub storage...');
                    await githubAdapter.connect(user.pat);
                }
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

    // If user is logged in but hasn't picked a project yet
    if (fileName === 'Untitled') {
        return <ProjectDashboard />;
    }

    return <>{children}</>;
}

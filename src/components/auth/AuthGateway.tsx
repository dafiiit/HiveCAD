import React, { useEffect } from 'react';
// import { useCADStore, useCADStoreApi } from '@/hooks/useCADStore'; // Removed
import { useGlobalStore } from '@/store/useGlobalStore';
import { AuthDialog } from './AuthDialog';
import { ProjectDashboard } from '../project/ProjectDashboard';

export function AuthGateway({ children }: { children: React.ReactNode }) {
    const { user, loadSession, initializeAuth, authLoaded, isAutosaveEnabled, showPATDialog, setShowPATDialog } = useGlobalStore();

    // Auth state initialization
    useEffect(() => {
        const unsubscribe = initializeAuth();
        return () => {
            unsubscribe();
        };
    }, []); // Run once on mount

    // Auto-connect to Storage if PAT is present
    useEffect(() => {
        const connectStorage = async () => {
            if (user?.pat && user.pat.trim() !== '') {
                const { StorageManager } = await import('@/lib/storage/StorageManager');
                const storageManager = StorageManager.getInstance();

                // Use the currently active adapter (LocalGit on desktop, GitHub on web)
                const adapter = storageManager.currentAdapter;

                if (adapter) {
                    if (!adapter.isAuthenticated()) {
                        console.log(`[AuthGateway] Auto-connecting ${adapter.name} storage...`);
                        const success = await adapter.connect(user.pat);

                        // If connection failed and we are on GitHub adapter, it might be an offline issue
                        // But if we are on LocalGitAdapter, it should work offline.

                        if (success) {
                            console.log(`[AuthGateway] ${adapter.name} storage connected successfully.`);
                            useGlobalStore.getState().setStorageConnected(true);
                            // Initialize UI store to load global settings
                            const { useUIStore } = await import('@/store/useUIStore');
                            useUIStore.getState().initialize();
                        } else {
                            console.error(`[AuthGateway] ${adapter.name} storage connection failed.`);
                            useGlobalStore.getState().setStorageConnected(false);
                        }
                    } else {
                        // Already authenticated (e.g. via setPAT), ensure store is in sync
                        if (!useGlobalStore.getState().isStorageConnected) {
                            console.log('[AuthGateway] Storage already authenticated, syncing state.');
                            useGlobalStore.getState().setStorageConnected(true);
                        }
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

    // If no user, show AuthDialog (welcome/auth)
    if (!user) {
        return <AuthDialog />;
    }

    // If user exists but no PAT (or explicit update requested), show AuthDialog (pat step)
    if (!user.pat || showPATDialog) {
        return <AuthDialog forcePAT={!user.pat} />;
    }

    return (
        <>
            {children}
        </>
    );
}

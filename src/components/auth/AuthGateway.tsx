import React, { useEffect } from 'react';
import { useGlobalStore } from '@/store/useGlobalStore';
import { AuthDialog } from './AuthDialog';
import { StorageManager } from '@/lib/storage/StorageManager';

export function AuthGateway({ children }: { children: React.ReactNode }) {
    const { user, initializeAuth, authLoaded, showPATDialog } = useGlobalStore();

    // Auth state initialization
    useEffect(() => {
        const unsubscribe = initializeAuth();
        return () => {
            unsubscribe();
        };
    }, []);

    // Initialize StorageManager + auto-connect remote when PAT is present
    useEffect(() => {
        const connectStorage = async () => {
            if (!user) return;

            const mgr = StorageManager.getInstance();

            // Initialize storage manager (creates QuickStore, RemoteStore, SyncEngine)
            if (!mgr.isInitialized) {
                await mgr.initialize(
                    () => useGlobalStore.getState().user?.id ?? null,
                    () => useGlobalStore.getState().user?.email ?? null,
                );
            }

            // Connect remote if PAT is available
            if (user.pat && user.pat.trim() !== '') {
                if (!mgr.isRemoteConnected) {
                    console.log('[AuthGateway] Auto-connecting remote storage...');
                    const success = await mgr.connectRemote(user.pat);

                    if (success) {
                        console.log('[AuthGateway] Remote storage connected.');
                        useGlobalStore.getState().setStorageConnected(true);
                        // Load UI settings from remote
                        const { useUIStore } = await import('@/store/useUIStore');
                        useUIStore.getState().initialize();
                    } else {
                        console.error('[AuthGateway] Remote storage connection failed.');
                        useGlobalStore.getState().setStorageConnected(false);
                    }
                } else {
                    if (!useGlobalStore.getState().isStorageConnected) {
                        useGlobalStore.getState().setStorageConnected(true);
                    }
                }
            } else {
                console.log('[AuthGateway] No PAT found, remote storage not connected.');
                useGlobalStore.getState().setStorageConnected(false);
            }
        };

        if (authLoaded && user) connectStorage();
    }, [authLoaded, user]);

    if (!authLoaded) return null;

    if (!user) {
        return <AuthDialog />;
    }

    if (!user.pat || showPATDialog) {
        return <AuthDialog forcePAT={!user.pat} />;
    }

    return <>{children}</>;
}

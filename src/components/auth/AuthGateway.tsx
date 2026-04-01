import React, { useEffect, useState } from 'react';
import { useGlobalStore } from '@/store/useGlobalStore';
import { AuthDialog } from './AuthDialog';
import { StorageManager } from '@/lib/storage/StorageManager';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

// Check if offline mode is enabled
const isOfflineMode = import.meta.env.VITE_OFFLINE_MODE === 'true';

export function AuthGateway({ children }: { children: React.ReactNode }) {
    const { user, initializeAuth, authLoaded, showPATDialog } = useGlobalStore();
    const [storageReady, setStorageReady] = useState(false);

    // Offline mode: Create mock user and skip authentication
    useEffect(() => {
        if (isOfflineMode) {
            console.log('[AuthGateway] Offline mode enabled - using mock user');
            const mockUser = {
                id: 'offline-dev-user',
                email: 'offline@dev.local',
                pat: null // No GitHub PAT in offline mode
            };
            useGlobalStore.setState({ 
                user: mockUser, 
                authLoaded: true,
                isStorageConnected: false // No remote storage in offline mode
            });
            setStorageReady(false);
            return;
        }
    }, []);

    // Auth state initialization
    useEffect(() => {
        if (isOfflineMode) return; // Skip auth init in offline mode
        
        const unsubscribe = initializeAuth();
        return () => {
            unsubscribe();
        };
    }, []);

    // Initialize StorageManager + auto-connect remote when PAT is present
    useEffect(() => {
        setStorageReady(false);

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

            // Skip remote connection in offline mode
            if (isOfflineMode) {
                console.log('[AuthGateway] Offline mode: Skipping remote storage connection');
                useGlobalStore.getState().setStorageConnected(false);
                // Load UI settings from local storage only
                const { useUIStore } = await import('@/store/useUIStore');
                useUIStore.getState().initialize();
                return;
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

        if (!authLoaded || !user) return;

        void connectStorage().finally(() => {
            setStorageReady(true);
        });
    }, [authLoaded, user]);

    if (!authLoaded) return <LoadingScreen message="Checking session..." />;

    // In offline mode, skip all auth checks
    if (isOfflineMode) {
        if (!storageReady) return <LoadingScreen message="Loading workspace..." />;
        return <>{children}</>;
    }

    if (!user) {
        return <AuthDialog />;
    }

    if (!storageReady) {
        return <LoadingScreen message="Loading workspace..." />;
    }

    if (!user.pat || showPATDialog) {
        return <AuthDialog forcePAT={!user.pat} />;
    }

    return <>{children}</>;
}

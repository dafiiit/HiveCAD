/**
 * SyncButton — Triggers a manual sync via SyncEngine.
 *
 * Desktop: always shows (manual sync).
 * Web:     auto-sync runs in background, but manual trigger is available too.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { toast } from 'sonner';
import { StorageManager } from '@/lib/storage/StorageManager';
import type { SyncState } from '@/lib/storage/types';

export function SyncButton() {
    const [syncState, setSyncState] = useState<SyncState>({
        status: 'idle',
        lastSyncTime: null,
        hasPendingChanges: false,
        lastError: null,
        wouldLoseData: false,
    });

    useEffect(() => {
        const engine = StorageManager.getInstance().syncEngine;
        if (!engine) return;

        // Poll sync state (engine exposes it)
        const interval = setInterval(() => {
            setSyncState(engine.state);
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const handleSync = async () => {
        const engine = StorageManager.getInstance().syncEngine;
        if (!engine) {
            toast.error('Sync engine not available');
            return;
        }

        toast.loading('Syncing...', { id: 'sync' });
        try {
            await engine.syncNow();
            toast.success('Sync complete', { id: 'sync' });
        } catch (error) {
            console.error('[SyncButton] Sync failed:', error);
            toast.error(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: 'sync' });
        }
    };

    const isSyncing = syncState.status === 'syncing';
    const lastSync = syncState.lastSyncTime ? new Date(syncState.lastSyncTime) : null;

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            title={lastSync ? `Last synced: ${lastSync.toLocaleTimeString()}` : 'Sync with remote'}
        >
            {isSyncing ? (
                <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                </>
            ) : lastSync ? (
                <>
                    <Cloud className="h-4 w-4 mr-2 text-green-500" />
                    Synced
                </>
            ) : (
                <>
                    <CloudOff className="h-4 w-4 mr-2" />
                    Sync
                </>
            )}
        </Button>
    );
}

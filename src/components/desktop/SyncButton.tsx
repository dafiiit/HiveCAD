/**
 * SyncButton - Desktop-only component for git sync
 * 
 * Syncs local changes with remote GitHub repository.
 */

import { useState } from 'react';
import { isDesktop } from '@/lib/platform/platform';
import { Button } from '@/components/ui/button';
import { RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { toast } from 'sonner';
import { StorageManager } from '@/lib/storage/StorageManager';

export function SyncButton() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

    // Don't render on web
    if (!isDesktop()) return null;

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const manager = StorageManager.getInstance();
            const adapter = manager.currentAdapter as any;

            if (typeof adapter.sync !== 'function') {
                throw new Error('Current adapter does not support sync');
            }

            toast.loading('Syncing with GitHub...', { id: 'sync' });
            await adapter.sync();

            setLastSyncTime(new Date());
            toast.success('Successfully synced with GitHub', { id: 'sync' });
        } catch (error) {
            console.error('[SyncButton] Sync failed:', error);
            toast.error(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: 'sync' });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            title={lastSyncTime ? `Last synced: ${lastSyncTime.toLocaleTimeString()}` : 'Sync with GitHub'}
        >
            {isSyncing ? (
                <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                </>
            ) : lastSyncTime ? (
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

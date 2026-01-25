import { StorageManager } from '@/lib/storage/StorageManager';
import { StorageAdapter, StorageType } from '@/lib/storage/types';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog';
import { Button } from './button'; // Assuming button component exists or I'll use standard button
import { toast } from 'sonner';
import { RefreshCw, Check, Cloud, Github, HardDrive } from 'lucide-react';

interface CloudConnectionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CloudConnectionsDialog({ open, onOpenChange }: CloudConnectionsDialogProps) {
    const [adapters, setAdapters] = useState<StorageAdapter[]>([]);
    const [activeType, setActiveType] = useState<StorageType>('public');
    const [connecting, setConnecting] = useState<string | null>(null);

    useEffect(() => {
        // Load adapters on mount
        const manager = StorageManager.getInstance();
        setAdapters(manager.getAllAdapters());
        setActiveType(manager.currentAdapter.type);
    }, [open]);

    const handleConnect = async (adapter: StorageAdapter) => {
        if (adapter.isAuthenticated()) {
            // Disconnect logic if we wanted to support logout
            // adapter.disconnect();
            return;
        }

        setConnecting(adapter.type);
        try {
            const success = await adapter.connect();
            if (success) {
                toast.success(`Connected to ${adapter.name}`);
                // Force re-render to show updated state
                setAdapters([...StorageManager.getInstance().getAllAdapters()]);
            } else {
                toast.error(`Failed to connect to ${adapter.name}`);
            }
        } catch (e) {
            toast.error(`Error: ${e}`);
        } finally {
            setConnecting(null);
        }
    };

    const handleSetActive = (adapter: StorageAdapter) => {
        if (!adapter.isAuthenticated()) {
            toast.error(`Please connect to ${adapter.name} first`);
            return;
        }

        StorageManager.getInstance().setAdapter(adapter.type);
        setActiveType(adapter.type);
        toast.success(`Switched storage to ${adapter.name}`);
    };

    const getIcon = (type: StorageType) => {
        switch (type) {
            case 'github': return <Github className="w-5 h-5" />;
            case 'drive': return <HardDrive className="w-5 h-5" />; // Using HardDrive as proxy for Drive
            default: return <Cloud className="w-5 h-5" />;
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Cloud Connections</DialogTitle>
                    <DialogDescription>
                        Manage your storage providers and authentications.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {adapters.map((adapter) => (
                        <div
                            key={adapter.type}
                            className={`flex items-center justify-between p-3 rounded-lg border ${activeType === adapter.type ? 'border-primary bg-primary/5' : 'border-border'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${activeType === adapter.type ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                                    {getIcon(adapter.type)}
                                </div>
                                <div>
                                    <div className="font-medium flex items-center gap-2">
                                        {adapter.name}
                                        {activeType === adapter.type && (
                                            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Active</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {adapter.isAuthenticated() ? 'Connected' : 'Not connected'}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {!adapter.isAuthenticated() ? (
                                    <button
                                        className="px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 rounded transition-colors"
                                        onClick={() => handleConnect(adapter)}
                                        disabled={!!connecting}
                                    >
                                        {connecting === adapter.type ? 'Connecting...' : 'Connect'}
                                    </button>
                                ) : (
                                    activeType !== adapter.type && (
                                        <button
                                            className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 rounded transition-colors"
                                            onClick={() => handleSetActive(adapter)}
                                        >
                                            Use This
                                        </button>
                                    )
                                )}
                                {adapter.isAuthenticated() && activeType === adapter.type && (
                                    <div className="text-green-500">
                                        <Check className="w-5 h-5" />
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}

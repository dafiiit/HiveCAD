import { StorageManager } from '@/lib/storage/StorageManager';
import { StorageAdapter, StorageType } from '@/lib/storage/types';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog';
import { Button } from './button'; // Assuming button component exists or I'll use standard button
import { toast } from 'sonner';
import { RefreshCw, Check, Github } from 'lucide-react';

interface CloudConnectionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CloudConnectionsDialog({ open, onOpenChange }: CloudConnectionsDialogProps) {
    const [adapters, setAdapters] = useState<StorageAdapter[]>([]);
    const [activeType, setActiveType] = useState<StorageType>('github');
    const [connecting, setConnecting] = useState<string | null>(null);
    const [githubToken, setGithubToken] = useState('');
    const [showGithubInput, setShowGithubInput] = useState(false);

    useEffect(() => {
        // Load adapters on mount
        const manager = StorageManager.getInstance();
        setAdapters(manager.getAllAdapters());
        setActiveType(manager.currentAdapter.type);
    }, [open]);

    const handleConnect = async (adapter: StorageAdapter) => {
        if (adapter.isAuthenticated()) return;

        // Special handling for GitHub to avoid native prompt issues
        if (adapter.type === 'github') {
            if (!showGithubInput) {
                setShowGithubInput(true);
                return;
            }
            // If already showing input, and githubToken is empty, treat as cancel
            if (!githubToken && showGithubInput) {
                setShowGithubInput(false);
                return;
            }
        }

        setConnecting(adapter.type);
        try {
            // Pass the token if we have one (primarily for GitHub)
            const success = await adapter.connect(adapter.type === 'github' ? githubToken : undefined);
            if (success) {
                toast.success(`Connected to ${adapter.name}`);
                setShowGithubInput(false);
                setGithubToken('');
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
            default: return <Github className="w-5 h-5" />;
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
                        <div key={adapter.type} className="space-y-3">
                            <div
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
                                            {connecting === adapter.type ? 'Connecting...' : (showGithubInput && adapter.type === 'github' ? 'Cancel' : 'Connect')}
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

                            {showGithubInput && adapter.type === 'github' && !adapter.isAuthenticated() && (
                                <div className="p-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="text-xs font-medium text-primary">Enter GitHub Personal Access Token</div>
                                    <div className="flex gap-2">
                                        <input
                                            type="password"
                                            className="flex-1 bg-background border border-input px-3 py-1.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                            placeholder="ghp_..."
                                            value={githubToken}
                                            onChange={(e) => setGithubToken(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleConnect(adapter)}
                                            autoFocus
                                        />
                                        <button
                                            className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:opacity-90"
                                            onClick={() => handleConnect(adapter)}
                                            disabled={!githubToken || !!connecting}
                                        >
                                            {connecting ? '...' : 'Verify'}
                                        </button>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        The token needs <code className="bg-secondary px-1 rounded">repo</code> and <code className="bg-secondary px-1 rounded">user</code> scopes. For your convenience, it is stored securely with your user account.
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}

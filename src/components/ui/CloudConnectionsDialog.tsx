import { StorageManager } from '@/lib/storage/StorageManager';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog';
import { toast } from 'sonner';
import { Check, Github, ExternalLink } from 'lucide-react';

interface CloudConnectionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CloudConnectionsDialog({ open, onOpenChange }: CloudConnectionsDialogProps) {
    const [isConnected, setIsConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [githubToken, setGithubToken] = useState('');

    useEffect(() => {
        if (open) {
            const mgr = StorageManager.getInstance();
            setIsConnected(mgr.isRemoteConnected);
        }
    }, [open]);

    const handleConnect = async () => {
        if (!githubToken.trim()) return;

        setConnecting(true);
        try {
            const mgr = StorageManager.getInstance();
            const success = await mgr.connectRemote(githubToken);
            if (success) {
                toast.success('Connected to GitHub');
                setIsConnected(true);
                setGithubToken('');
            } else {
                toast.error('Failed to connect — check your token');
            }
        } catch (e) {
            toast.error(`Error: ${e}`);
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            const mgr = StorageManager.getInstance();
            await mgr.disconnectRemote();
            setIsConnected(false);
            toast.success('Disconnected from GitHub');
        } catch (e) {
            toast.error(`Error: ${e}`);
        }
    };

    const handleGetToken = async () => {
        const url = "https://github.com/settings/tokens/new?description=HiveCAD%20Storage&scopes=repo,user";
        try {
            const { getPlatformApi } = await import('@/lib/platform');
            const platform = await getPlatformApi();
            await platform.openUrl(url);
        } catch (error) {
            // Fallback to window.open for web
            window.open(url, '_blank');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Cloud Connections</DialogTitle>
                    <DialogDescription>
                        Connect to GitHub to back up your projects and sync across devices.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-3">
                        <div
                            className={`flex items-center justify-between p-3 rounded-lg border ${isConnected ? 'border-primary bg-primary/5' : 'border-border'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${isConnected ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                                    <Github className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-medium flex items-center gap-2">
                                        GitHub
                                        {isConnected && (
                                            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Active</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {isConnected ? 'Connected' : 'Not connected'}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {isConnected ? (
                                    <>
                                        <button
                                            className="px-3 py-1.5 text-xs font-medium bg-destructive/10 hover:bg-destructive/20 text-destructive rounded transition-colors"
                                            onClick={handleDisconnect}
                                        >
                                            Disconnect
                                        </button>
                                        <div className="text-green-500">
                                            <Check className="w-5 h-5" />
                                        </div>
                                    </>
                                ) : (
                                    <span className="text-xs text-muted-foreground">Enter token below</span>
                                )}
                            </div>
                        </div>

                        {!isConnected && (
                            <div className="p-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 space-y-3 animate-in fade-in slide-in-from-top-2">
                                <button
                                    className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity mb-2"
                                    onClick={handleGetToken}
                                >
                                    <Github className="w-4 h-4" />
                                    Get GitHub Token
                                    <ExternalLink className="w-3 h-3 opacity-50" />
                                </button>
                                <div className="text-xs font-medium text-primary">Enter GitHub Personal Access Token</div>
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        className="flex-1 bg-background border border-input px-3 py-1.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                        placeholder="ghp_..."
                                        value={githubToken}
                                        onChange={(e) => setGithubToken(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                                        autoFocus
                                    />
                                    <button
                                        className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:opacity-90"
                                        onClick={handleConnect}
                                        disabled={!githubToken || connecting}
                                    >
                                        {connecting ? '...' : 'Verify'}
                                    </button>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    The token needs <code className="bg-secondary px-1 rounded">repo</code> and <code className="bg-secondary px-1 rounded">user</code> scopes. It is stored securely with your user account.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

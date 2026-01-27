import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog';
import { Button } from './button';
import { Input } from './input';
import { Github, Info, AlertTriangle, ExternalLink, Trash2 } from 'lucide-react';
import { useGlobalStore } from '@/store/useGlobalStore';
import { toast } from 'sonner';

interface GitHubTokenDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'create' | 'exit';
    onConfirm?: () => void;
    onSecondaryAction?: () => void;
}

export function GitHubTokenDialog({ open, onOpenChange, mode, onConfirm, onSecondaryAction }: GitHubTokenDialogProps) {
    const { setPAT, user } = useGlobalStore();
    const [token, setToken] = useState('');
    const [verifying, setVerifying] = useState(false);

    const handleVerify = async () => {
        if (!token) return;
        setVerifying(true);
        try {
            // Re-use logic from CloudConnectionsDialog or just use setPAT
            await setPAT(token);
            toast.success("GitHub PAT saved successfully!");
            onConfirm?.();
            onOpenChange(false);
        } catch (error) {
            toast.error("Failed to verify token. Please check and try again.");
        } finally {
            setVerifying(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px] bg-[#1a1a1a] border-zinc-800 text-zinc-100">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-primary/20 rounded-lg text-primary">
                            <Github className="w-6 h-6" />
                        </div>
                        <DialogTitle className="text-xl font-bold tracking-tight">
                            {mode === 'create' ? 'Link your GitHub' : 'Project Sync Warning'}
                        </DialogTitle>
                    </div>
                    <DialogDescription className="text-zinc-400 text-sm leading-relaxed">
                        HiveCAD is <strong className="text-zinc-200 font-bold tracking-wide">decentralized</strong>. Your designs stay in <strong className="text-zinc-200 font-bold tracking-wide">your GitHub</strong>, not on our servers.
                        We need your Personal Access Token (PAT) to ensure your CAD is saved securely to your own repository.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                            <div className="text-xs text-zinc-300 space-y-1">
                                <p className="font-semibold text-zinc-100">Why do I need a Personal Access Token (PAT)?</p>
                                <p>This token allows HiveCAD to create a repository called <strong>hivecad-projects</strong> in your account where your files will be stored.</p>
                            </div>
                        </div>

                        <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Enter PAT</label>
                                <a
                                    href="https://github.com/settings/tokens/new?description=HiveCAD%20Storage&scopes=repo,user"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors font-bold uppercase tracking-wider"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    Click here to get PAT
                                </a>
                            </div>
                            <Input
                                type="password"
                                placeholder="ghp_..."
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                className="bg-black border-zinc-800 focus:ring-primary focus:border-zinc-700 text-white"
                                autoFocus
                            />
                        </div>

                    </div>

                    {mode === 'exit' && (
                        <div className="flex items-center gap-3 p-3 bg-red-900/10 border border-red-900/20 rounded-lg text-red-400">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <p className="text-xs">Exiting without a token will result in your Project being deleted.</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    {mode === 'create' ? (
                        <Button
                            variant="ghost"
                            onClick={() => {
                                onSecondaryAction?.();
                                onOpenChange(false);
                            }}
                            className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                        >
                            Skip (Local Only)
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            onClick={() => {
                                onSecondaryAction?.();
                                onOpenChange(false);
                            }}
                            className="text-red-500 hover:text-red-400 hover:bg-red-900/10 gap-2 font-bold"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete Project
                        </Button>
                    )}

                    <Button
                        onClick={handleVerify}
                        disabled={!token || verifying}
                        className="bg-primary text-white hover:bg-primary/90 font-bold px-8 shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                    >
                        {verifying ? 'Verifying...' : (mode === 'create' ? 'Create Project' : 'Sync & Exit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

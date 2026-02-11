import React, { useState, useEffect, useMemo } from 'react';
import type { CommitInfo, BranchInfo } from '@/lib/storage/types';
import { VCSGraph } from '../cad/VCSGraph';
import { StorageManager } from '@/lib/storage/StorageManager';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { GitBranch, GitCommit, Calendar, User, Eye, Copy, ArrowRight, Clock, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface ProjectHistoryViewProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    onViewVersion: (sha: string) => void;
}

export function ProjectHistoryView({ isOpen, onClose, projectId, onViewVersion }: ProjectHistoryViewProps) {
    const [commits, setCommits] = useState<CommitInfo[]>([]);
    const [branches, setBranches] = useState<BranchInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
    const [newBranchName, setNewBranchName] = useState('');
    const [creatingBranch, setCreatingBranch] = useState(false);

    useEffect(() => {
        if (isOpen && projectId) {
            loadHistory();
        }
    }, [isOpen, projectId]);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const mgr = StorageManager.getInstance();

            // Try QuickStore first (always available)
            let fetchedCommits: CommitInfo[] = [];
            let fetchedBranches: BranchInfo[] = [];

            try {
                fetchedBranches = await mgr.quickStore.getBranches(projectId);
                fetchedCommits = await mgr.quickStore.getHistory(projectId);
            } catch (e) {
                console.warn('[ProjectHistoryView] QuickStore history failed, trying remote', e);
            }

            // Fallback to remote if QuickStore has nothing
            if (fetchedCommits.length === 0 && mgr.isRemoteConnected) {
                try {
                    fetchedBranches = await mgr.remoteStore!.getBranches(projectId);
                    fetchedCommits = await mgr.remoteStore!.getHistory(projectId);
                } catch (e) {
                    console.warn('[ProjectHistoryView] Remote history failed', e);
                }
            }

            setBranches(fetchedBranches);
            setCommits(fetchedCommits);
        } catch (error) {
            console.error("Failed to load history:", error);
            toast.error("Failed to load project history");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBranch = async () => {
        if (!selectedCommit || !newBranchName.trim()) return;

        setCreatingBranch(true);
        try {
            const mgr = StorageManager.getInstance();
            await mgr.quickStore.createBranch(projectId, newBranchName.trim(), selectedCommit.hash);
            await mgr.quickStore.switchBranch(projectId, newBranchName.trim());
            toast.success(`Created and switched to branch ${newBranchName}`);
            onClose();
        } catch (error: any) {
            toast.error(error.message || "Failed to create branch");
        } finally {
            setCreatingBranch(false);
        }
    };

    const mappedCommits = useMemo(() => {
        return commits.map(c => {
            let branchName = 'main';
            if (c.refNames) {
                const branchRef = c.refNames.find(r => r.includes('heads/')) || c.refNames[0];
                if (branchRef) {
                    branchName = branchRef.replace('heads/', '').replace('origin/', '');
                }
            }

            return {
                id: c.hash,
                parentId: c.parents && c.parents.length > 0 ? c.parents[0] : null,
                message: c.message,
                author: c.author.name,
                timestamp: new Date(c.author.date).getTime(),
                branchName
            };
        });
    }, [commits]);


    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent aria-describedby={undefined} className="max-w-4xl h-[80vh] bg-[#1a1a1a] border-zinc-800 text-zinc-300 flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 border-b border-zinc-800 shrink-0">
                    <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                        <GitBranch className="w-5 h-5 text-primary" />
                        Project History
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex overflow-hidden">
                    <div className="flex-1 bg-zinc-950/50 p-6 overflow-auto border-zinc-800">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500 italic gap-3">
                                <RefreshCw className="w-8 h-8 animate-spin opacity-20" />
                                <span>Loading repository history...</span>
                            </div>
                        ) : commits.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500 italic gap-4">
                                <GitCommit className="w-12 h-12 opacity-10" />
                                <div className="text-center">
                                    <p>No history found for this project.</p>
                                    <p className="text-xs opacity-60 mt-1">Create a commit to start tracking changes.</p>
                                </div>
                            </div>
                        ) : (
                            <VCSGraph
                                commits={mappedCommits}
                                currentCommitId={selectedCommit?.hash}
                                onCheckout={(id) => {
                                    const commit = commits.find(c => c.hash === id);
                                    if (commit) setSelectedCommit(commit);
                                }}
                            />
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

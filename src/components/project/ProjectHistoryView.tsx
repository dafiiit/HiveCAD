import React, { useState, useEffect, useMemo } from 'react';
import { CommitInfo, BranchInfo } from '@/lib/storage/types';
import { Commit as VCSCommit } from '@/lib/vcs/types';
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
import { get as idbGet } from 'idb-keyval';

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
            const adapter = StorageManager.getInstance().currentAdapter;
            let fetchedCommits: CommitInfo[] = [];

            if (adapter.getBranches) {
                const branches = await adapter.getBranches(projectId);
                setBranches(branches);
            }

            if (adapter.getHistory) {
                fetchedCommits = await adapter.getHistory(projectId);
            }

            if (fetchedCommits.length === 0) {
                // Try to load from local history if remote is empty
                const localProject = await idbGet(`project:${projectId}`);
                if (localProject?.vcs?.commits) {
                    const localCommits = localProject.vcs.commits.map(([id, commit]: [string, any]) => ({
                        hash: id,
                        parents: commit.parentId ? [commit.parentId] : [],
                        author: { name: commit.author, date: new Date(commit.timestamp).toISOString() },
                        subject: commit.message,
                        refNames: commit.branchName ? [`heads/${commit.branchName}`] : []
                    }));
                    fetchedCommits = localCommits.sort((a, b: any) => new Date(b.author.date).getTime() - new Date(a.author.date).getTime());
                }
            }

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
            const adapter = StorageManager.getInstance().currentAdapter;
            if (adapter.createBranch && adapter.switchBranch) {
                await adapter.createBranch(projectId, selectedCommit.hash, newBranchName.trim());
                await adapter.switchBranch(newBranchName.trim().startsWith('project/') ? newBranchName.trim() : `project/${projectId}/${newBranchName.trim()}`);
                toast.success(`Created and switched to branch ${newBranchName}`);
                onClose();
                // Trigger reload of project? The parent component handles simple close, 
                // but switching branch might require reloading the project data in the editor.
                // We'll rely on global state update or manual refresh triggered by user or parent.
                // ideally we call onViewVersion (which reloads) but skipping the "View Only" part.
                // Actually onViewVersion loads a specific SHA. We want to load the *HEAD* of the new branch.
                // But onViewVersion is "View Only". 
                // We probably need a callback `onSwitchBranch`.
                // For now, let's just close and let the user see the new branch state if the app handles it.
                // Wait, App needs to know to reload.
                // todo:refine Replace full page reload with a proper branch-switch callback that rehydrates project state.
                window.location.reload(); // Brute force but effective for now to ensure all state is fresh? 
                // Or better: use useCADStore or similar to trigger reload. 
                // But we are deep in component.
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to create branch");
        } finally {
            setCreatingBranch(false);
        }
    };

    const mappedCommits = useMemo(() => {
        return commits.map(c => {
            // Try to find a branch name in refNames (e.g. "heads/main" or just "main")
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
                message: c.subject,
                author: c.author.name,
                timestamp: new Date(c.author.date).getTime(),
                branchName
            } as VCSCommit;
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
                    {/* Graph Area */}
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
                                    <p className="text-xs opacity-60 mt-1">Make sure you are connected to GitHub.</p>
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

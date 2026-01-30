import React, { useState, useEffect, useMemo } from 'react';
import { Gitgraph, templateExtend, TemplateName } from '@gitgraph/react';
import { CommitInfo, BranchInfo } from '@/lib/storage/types';
import { StorageManager } from '@/lib/storage/StorageManager';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { GitBranch, GitCommit, Calendar, User, Eye, Copy, ArrowRight } from 'lucide-react';
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
            const adapter = StorageManager.getInstance().currentAdapter;
            if (adapter.getBranches) {
                const branches = await adapter.getBranches(projectId);
                setBranches(branches);
            }
            if (adapter.getHistory) {
                const history = await adapter.getHistory(projectId);
                setCommits(history);
            }
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

    const graphData = useMemo(() => {
        // Prepare commits for Gitgraph
        // We need to reverse assuming getHistory returns newest first
        return [...commits].reverse().map(c => ({
            hash: c.hash,
            subject: c.subject,
            author: c.author.name,
            date: new Date(c.author.date),
            refs: c.refNames || [], // Tagging HEAD/Branches
        }));
    }, [commits]);

    const options = {
        template: templateExtend(TemplateName.Metro, {
            colors: ['#e11d48', '#0ea5e9', '#22c55e', '#eab308'], // primary colors
            branch: {
                lineWidth: 3,
                label: {
                    display: true,
                    font: "bold 10pt sans-serif"
                }
            },
            commit: {
                message: {
                    displayAuthor: false,
                    displayHash: false,
                },
                dot: {
                    size: 8,
                }
            }
        }),
        // orientation: 'vertical-reverse' as const 
    };

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
                    <div className="flex-1 bg-[#222] p-4 overflow-auto border-r border-zinc-800 min-w-[400px]">
                        {loading ? (
                            <div className="flex items-center justify-center h-full text-zinc-500">Loading history...</div>
                        ) : commits.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-zinc-500">No history found</div>
                        ) : (
                            <Gitgraph options={options}>
                                {(gitgraph) => {
                                    // We'll simulate a single branch for now as we just have a linear list or simple diverged list from API
                                    // Real multi-branch reconstruction is complex. 
                                    // We will just feed the commits to a "main" branch for visualization 
                                    // unless we can map them to specific branches.
                                    // Given we fetched commits for *current* branch, it's mostly linear or merged.
                                    // We can just add them sequentially.
                                    const master = gitgraph.branch("history");

                                    // Replay commits
                                    // Note: Gitgraph expects commits in order.
                                    // If we rely on the API array, it's chronological.
                                    // We need to handle parents? Gitgraph handles parents if we use .commit() sequentially?
                                    // No, Gitgraph builds its own history.
                                    // If we want to visualize exact structure, we might need `import` (not available in react lib easily)
                                    // or just render them as a linear log for now, which is still better than nothing.
                                    // Actually, let's just render them.

                                    commits.slice().reverse().forEach(c => {
                                        master.commit({
                                            hash: c.hash,
                                            subject: c.subject,
                                            author: c.author.name,
                                            onClick: () => setSelectedCommit(c),
                                            onMessageClick: () => setSelectedCommit(c),
                                            onMouseOver: () => document.body.style.cursor = "pointer",
                                            onMouseOut: () => document.body.style.cursor = "default",
                                            renderTooltip: (commit: any) => (
                                                <div style={{ padding: '5px', background: '#333', border: '1px solid #444', borderRadius: '4px' }}>
                                                    {c.subject} ({c.author.name})
                                                </div>
                                            ) // types conflict sometimes, but let's try
                                        });

                                        // If this commit corresponds to a known branch head, tag it
                                        const branch = branches.find(b => b.sha === c.hash);
                                        if (branch) {
                                            master.tag(branch.name);
                                        }
                                    });
                                }}
                            </Gitgraph>
                        )}
                    </div>

                    {/* Details Panel */}
                    <div className="w-80 bg-[#1a1a1a] p-6 flex flex-col gap-6 shrink-0 overflow-y-auto">
                        {selectedCommit ? (
                            <>
                                <div>
                                    <h3 className="font-bold text-white text-lg mb-2 line-clamp-2">{selectedCommit.subject}</h3>
                                    <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
                                        <Badge variant="outline" className="font-mono text-[10px]">{selectedCommit.hash.substring(0, 7)}</Badge>
                                        <span>•</span>
                                        <span>{formatDistanceToNow(new Date(selectedCommit.author.date))} ago</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
                                        <User className="w-4 h-4" />
                                        {selectedCommit.author.name}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                                        <Calendar className="w-4 h-4" />
                                        {new Date(selectedCommit.author.date).toLocaleDateString()}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Button
                                        className="w-full gap-2"
                                        variant="secondary"
                                        onClick={() => onViewVersion(selectedCommit.hash)}
                                    >
                                        <Eye className="w-4 h-4" />
                                        View This Version
                                    </Button>

                                    <div className="h-px bg-zinc-800 my-2" />

                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-zinc-500 uppercase">Branch from here</label>
                                        <Input
                                            placeholder="New branch name..."
                                            value={newBranchName}
                                            onChange={(e) => setNewBranchName(e.target.value)}
                                            className="bg-[#2a2a2a] border-zinc-700"
                                        />
                                        <Button
                                            className="w-full gap-2"
                                            onClick={handleCreateBranch}
                                            disabled={!newBranchName.trim() || creatingBranch}
                                        >
                                            <Copy className="w-4 h-4" />
                                            {creatingBranch ? 'Creating...' : 'Branch & Edit'}
                                        </Button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center space-y-4">
                                <GitCommit className="w-12 h-12 opacity-20" />
                                <p>Select a commit from the graph to view details and options.</p>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

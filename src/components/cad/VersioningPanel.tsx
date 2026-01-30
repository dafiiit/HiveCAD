import React, { useState } from 'react';
import { useCADStore } from '@/hooks/useCADStore';
import {
    GitBranch,
    GitCommit,
    History,
    Plus,
    User,
    Clock,
    Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow } from 'date-fns';
import { VCSGraph } from './VCSGraph';

const VersioningPanel: React.FC = () => {
    const {
        fullVersions,
        branches,
        currentBranch,
        currentVersionId,
        createVersion,
        createBranch,
        checkoutVersion,
        history,
        historyIndex,
        goToHistoryIndex
    } = useCADStore(state => ({
        fullVersions: state.fullVersions,
        branches: state.branches,
        currentBranch: state.currentBranch,
        currentVersionId: state.currentVersionId,
        createVersion: state.createVersion,
        createBranch: state.createBranch,
        checkoutVersion: state.checkoutVersion,
        history: state.history,
        historyIndex: state.historyIndex,
        goToHistoryIndex: state.goToHistoryIndex
    }));

    const [commitMessage, setCommitMessage] = useState('');
    const [newBranchName, setNewBranchName] = useState('');
    const [isCreatingBranch, setIsCreatingBranch] = useState(false);

    const handleCommit = () => {
        if (!commitMessage.trim()) return;
        createVersion(commitMessage);
        setCommitMessage('');
    };

    const handleCreateBranch = () => {
        if (!newBranchName.trim()) return;
        createBranch(newBranchName);
        setNewBranchName('');
        setIsCreatingBranch(false);
    };

    return (
        <div className="flex flex-col h-full bg-background border-l border-border w-full">
            {/* Header */}
            <div className="p-4 border-b border-border space-y-2">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Project History
                    </h2>
                    <Badge variant="outline" className="flex items-center gap-1">
                        <GitBranch className="w-3 h-3" />
                        {currentBranch}
                    </Badge>
                </div>

                <div className="flex gap-2">
                    <Input
                        placeholder="Commit message..."
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        className="h-8 text-xs"
                        onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
                    />
                    <Button size="sm" variant="secondary" onClick={handleCommit} className="h-8">
                        <Plus className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                    {/* Working Tree (Transient History) */}
                    <section>
                        <h3 className="text-[10px] font-bold uppercase text-muted-foreground mb-3 flex items-center gap-2">
                            <Zap className="w-3 h-3 text-yellow-500" />
                            Transient History (Undo/Redo)
                        </h3>
                        <div className="space-y-1">
                            {history.map((item, idx) => (
                                <button
                                    key={item.id}
                                    onClick={() => goToHistoryIndex(idx)}
                                    className={`w-full text-left p-2 rounded-md text-xs transition-colors border ${idx === historyIndex
                                        ? 'bg-primary/10 border-primary/20 text-primary'
                                        : 'border-transparent hover:bg-muted'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="truncate">{item.name}</span>
                                        <span className="text-[10px] opacity-50">
                                            {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>

                    <Separator />

                    {/* Persistent History (Commits) */}
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-2">
                                <GitCommit className="w-3 h-3 text-blue-500" />
                                Persistent History (Commits)
                            </h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => setIsCreatingBranch(!isCreatingBranch)}
                            >
                                <GitBranch className="w-3 h-3" />
                            </Button>
                        </div>

                        {isCreatingBranch && (
                            <div className="flex gap-2 mb-3">
                                <Input
                                    placeholder="New branch name..."
                                    value={newBranchName}
                                    onChange={(e) => setNewBranchName(e.target.value)}
                                    className="h-7 text-[10px]"
                                    autoFocus
                                />
                                <Button size="sm" onClick={handleCreateBranch} className="h-7 px-2">
                                    Create
                                </Button>
                            </div>
                        )}

                        <div className="mt-2 min-h-[300px]">
                            {fullVersions.length === 0 ? (
                                <div className="text-[10px] text-muted-foreground italic flex flex-col items-center justify-center h-32 gap-2">
                                    <GitCommit className="w-8 h-8 opacity-10" />
                                    No persistent commits yet.
                                </div>
                            ) : (
                                <VCSGraph
                                    commits={fullVersions}
                                    currentCommitId={currentVersionId || undefined}
                                    onCheckout={checkoutVersion}
                                    compact={true}
                                />
                            )}
                        </div>
                    </section>
                </div>
            </ScrollArea>

            {/* Footer / Branch Switcher */}
            <div className="p-4 border-t border-border bg-muted/20">
                <div className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Branches</div>
                <div className="flex flex-wrap gap-1">
                    {Array.from(branches.keys()).map((branch: string) => (
                        <Badge
                            key={branch}
                            variant={branch === currentBranch ? "default" : "outline"}
                            className="cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1"
                            onClick={() => checkoutVersion(branch)}
                        >
                            <GitBranch className="w-3 h-3" />
                            {branch}
                        </Badge>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default VersioningPanel;

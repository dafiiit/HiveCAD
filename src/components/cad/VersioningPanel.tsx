import { useState } from "react";
import { useCADStore } from "@/hooks/useCADStore";
import { useGlobalStore } from "@/store/useGlobalStore";
import { GitBranch, GitCommit, Plus, GitCompare, Search, ChevronDown, GitFork, Star, GitMerge, MoreVertical, Github, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const VersioningPanel = () => {
    const {
        versions,
        branches,
        currentBranch,
        currentVersionId,
        createVersion,
        createBranch,
        checkoutVersion,
        setMainBranch,
        mergeBranch,
        compareVersions
    } = useCADStore();

    const { user, showPATDialog, setShowPATDialog } = useGlobalStore();

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedBranch, setSelectedBranch] = useState<string>("all");
    const [newVersionMessage, setNewVersionMessage] = useState("");
    const [showCreateVersion, setShowCreateVersion] = useState(false);
    const [showCreateBranch, setShowCreateBranch] = useState(false);
    const [newBranchName, setNewBranchName] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const [compareMode, setCompareMode] = useState(false);
    const [compareSource, setCompareSource] = useState<string | null>(null);
    const [contextMenuVersion, setContextMenuVersion] = useState<string | null>(null);

    const handleCreateVersion = () => {
        if (!newVersionMessage.trim()) {
            toast.error("Please enter a version message");
            return;
        }
        createVersion(newVersionMessage);
        setNewVersionMessage("");
        setShowCreateVersion(false);
        toast.success("Version created successfully");
    };

    const handleCreateBranch = () => {
        if (!newBranchName.trim()) {
            toast.error("Please enter a branch name");
            return;
        }
        createBranch(newBranchName);
        setNewBranchName("");
        setShowCreateBranch(false);
    };

    const handleCheckout = (versionId: string) => {
        if (compareMode) {
            if (!compareSource) {
                setCompareSource(versionId);
                toast("Select another version to compare");
            } else {
                compareVersions(compareSource, versionId);
                setCompareMode(false);
                setCompareSource(null);
                toast.success("Comparing versions");
            }
            return;
        }
        checkoutVersion(versionId);
        toast.success("Checked out version");
    };

    const handleSetAsMain = (versionId: string) => {
        setMainBranch(versionId);
        setContextMenuVersion(null);
    };

    const handleMergeToMain = (versionId: string) => {
        const version = versions.find(v => v.id === versionId);
        if (version && version.branch !== 'main') {
            mergeBranch(version.branch, 'main');
            setContextMenuVersion(null);
        } else {
            toast.error("Cannot merge main into main");
        }
    };

    const startCompareMode = () => {
        setCompareMode(true);
        setCompareSource(null);
        toast("Select the first version to compare");
    };

    const cancelCompareMode = () => {
        setCompareMode(false);
        setCompareSource(null);
    };

    const filteredVersions = versions.filter(v => {
        const matchesBranch = selectedBranch === "all" || v.branch === selectedBranch;
        const matchesSearch = !searchQuery ||
            v.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.author.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesBranch && matchesSearch;
    }).reverse();

    const branchNames = Array.from(branches.keys());

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Git</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => { setShowCreateVersion(!showCreateVersion); setShowCreateBranch(false); }}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            showCreateVersion ? "bg-primary text-primary-foreground" : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                        )}
                        title="Create Version"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => { setShowCreateBranch(!showCreateBranch); setShowCreateVersion(false); }}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            showCreateBranch ? "bg-primary text-primary-foreground" : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                        )}
                        title="Create Branch"
                    >
                        <GitFork className="w-4 h-4" />
                    </button>
                    <button
                        onClick={compareMode ? cancelCompareMode : startCompareMode}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            compareMode ? "bg-orange-500 text-white" : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                        )}
                        title={compareMode ? "Cancel Compare" : "Compare Versions"}
                    >
                        <GitCompare className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setShowPATDialog(true)}
                        className={cn(
                            "p-1.5 rounded transition-colors hover:bg-secondary text-muted-foreground hover:text-foreground",
                            user?.pat ? "text-primary" : ""
                        )}
                        title={user?.pat ? "Update GitHub Token" : "Link GitHub Account"}
                    >
                        <Github className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* GitHub Status Section */}
            <div className="px-3 py-2 border-b border-border bg-muted/20">
                <div className="flex items-center">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Cloud Sync Active
                        </span>
                    </div>
                </div>
                <div className="mt-1 flex items-center justify-between">
                    <p className="text-2xs text-muted-foreground truncate max-w-[180px]">
                        Connected as <span className="text-foreground font-medium">{user.email}</span>
                    </p>
                </div>
            </div>

            {/* Compare Mode Banner */}
            {compareMode && (
                <div className="px-3 py-2 bg-orange-500/20 border-b border-orange-500/30 text-xs text-orange-700 dark:text-orange-300">
                    {compareSource ? "Now select the second version" : "Select first version to compare"}
                    <button onClick={cancelCompareMode} className="ml-2 underline">Cancel</button>
                </div>
            )}

            {/* Create Version Form */}
            {showCreateVersion && (
                <div className="p-3 border-b border-border bg-muted/30">
                    <input
                        type="text"
                        value={newVersionMessage}
                        onChange={(e) => setNewVersionMessage(e.target.value)}
                        placeholder="Version message..."
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateVersion();
                            if (e.key === 'Escape') setShowCreateVersion(false);
                        }}
                        autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={handleCreateVersion}
                            className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                        >
                            Create
                        </button>
                        <button
                            onClick={() => setShowCreateVersion(false)}
                            className="px-3 py-1.5 text-xs font-medium bg-secondary text-foreground rounded-md hover:bg-secondary/80 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Create Branch Form */}
            {showCreateBranch && (
                <div className="p-3 border-b border-border bg-muted/30">
                    <input
                        type="text"
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        placeholder="Branch name..."
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateBranch();
                            if (e.key === 'Escape') setShowCreateBranch(false);
                        }}
                        autoFocus
                    />
                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={handleCreateBranch}
                            className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                        >
                            Create Branch
                        </button>
                        <button
                            onClick={() => setShowCreateBranch(false)}
                            className="px-3 py-1.5 text-xs font-medium bg-secondary text-foreground rounded-md hover:bg-secondary/80 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Collapsible Filter Section */}
            <div className="border-b border-border">
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                    <span>Filter: {selectedBranch === 'all' ? 'All branches' : selectedBranch}</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showFilters && "rotate-180")} />
                </button>
                {showFilters && (
                    <div className="px-3 pb-3 space-y-2">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search..."
                                className="w-full pl-7 pr-3 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>
                        <select
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="all">All branches</option>
                            {branchNames.map(branch => (
                                <option key={branch} value={branch}>{branch}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Version List */}
            <div className="flex-1 overflow-y-auto">
                {filteredVersions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                        <GitCommit className="w-10 h-10 text-muted-foreground/40 mb-2" />
                        <p className="text-xs text-muted-foreground">No versions yet</p>
                    </div>
                ) : (
                    <div className="p-2 space-y-1">
                        {filteredVersions.map((version) => {
                            const isCurrentVersion = version.id === currentVersionId;
                            const isMainHead = branches.get('main') === version.id;
                            const isCompareSource = compareSource === version.id;

                            return (
                                <div
                                    key={version.id}
                                    className={cn(
                                        "group relative flex items-start gap-2 p-2 rounded cursor-pointer transition-colors",
                                        isCompareSource
                                            ? "bg-orange-500/20 border border-orange-500/40"
                                            : isCurrentVersion
                                                ? "bg-primary/10 border border-primary/20"
                                                : "hover:bg-muted"
                                    )}
                                    onClick={() => handleCheckout(version.id)}
                                >
                                    <GitCommit className={cn(
                                        "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
                                        isCurrentVersion ? "text-primary" : "text-muted-foreground"
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <p className="text-xs font-medium truncate">{version.message}</p>
                                            {isMainHead && (
                                                <span className="px-1 py-0.5 text-2xs font-medium bg-green-500/20 text-green-700 dark:text-green-300 rounded flex items-center gap-0.5">
                                                    <Star className="w-2.5 h-2.5" />
                                                    Main
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                                            <span className="px-1 py-0.5 bg-muted rounded">{version.branch}</span>
                                            <span>{new Date(version.timestamp).toLocaleString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}</span>
                                        </div>
                                    </div>

                                    {/* Action Menu */}
                                    <div className="relative">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setContextMenuVersion(contextMenuVersion === version.id ? null : version.id);
                                            }}
                                            className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                                            title="Actions"
                                        >
                                            <MoreVertical className="w-3.5 h-3.5" />
                                        </button>

                                        {/* Dropdown Menu */}
                                        {contextMenuVersion === version.id && (
                                            <div
                                                className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[140px]"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {!isMainHead && (
                                                    <button
                                                        onClick={() => handleSetAsMain(version.id)}
                                                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                                                    >
                                                        <Star className="w-3 h-3" />
                                                        Set as Main
                                                    </button>
                                                )}
                                                {version.branch !== 'main' && (
                                                    <button
                                                        onClick={() => handleMergeToMain(version.id)}
                                                        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                                                    >
                                                        <GitMerge className="w-3 h-3" />
                                                        Merge to Main
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setCompareSource(version.id);
                                                        setCompareMode(true);
                                                        setContextMenuVersion(null);
                                                        toast("Select another version to compare");
                                                    }}
                                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                                                >
                                                    <GitCompare className="w-3 h-3" />
                                                    Compare...
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Current Branch Info */}
            <div className="px-3 py-2 bg-transparent opacity-60">
                <div className="flex items-center gap-2 text-xs">
                    <GitBranch className="w-3 h-3 text-muted-foreground" />
                    <span className="font-medium">{currentBranch}</span>
                    {currentVersionId && (
                        <span className="text-muted-foreground truncate text-2xs">
                            • {versions.find(v => v.id === currentVersionId)?.message || currentVersionId.slice(0, 8)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VersioningPanel;

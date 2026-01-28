import { useState } from "react";
import BrowserPanel from "./BrowserPanel";
import CodeEditorPanel from "./CodeEditorPanel";
import VersioningPanel from "./VersioningPanel";
import CommentsPanel from "./CommentsPanel";
import { ChevronRight, Minus, Code, FolderTree, GitBranch, MessageSquare, Box } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCADStore } from "@/hooks/useCADStore";

const UnifiedSidebar = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState<'browser' | 'code' | 'versioning' | 'comments'>('browser');
    const { objects, selectedIds } = useCADStore();

    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };

    return (
        <div
            className={cn(
                "flex flex-col h-full border-r border-border bg-background transition-all duration-300 ease-in-out flex-none",
                isCollapsed ? "w-10" : "w-96"
            )}
        >
            {/* Header with Tabs */}
            <div className={cn(
                "h-10 flex items-center border-b border-border bg-muted/30 select-none overflow-hidden",
                isCollapsed ? "justify-center flex-col py-2 h-auto gap-2 bg-transparent border-b-0" : "px-2"
            )}>
                {/* Expanded Header Content */}
                {!isCollapsed && (
                    <>
                        <div className="flex items-center space-x-1 flex-1">
                            <button
                                onClick={() => setActiveTab('browser')}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                                    activeTab === 'browser'
                                        ? "bg-background shadow-sm text-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <FolderTree className="w-3.5 h-3.5" />
                                <span>Browser</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('code')}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                                    activeTab === 'code'
                                        ? "bg-background shadow-sm text-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <Code className="w-3.5 h-3.5" />
                                <span>Code</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('versioning')}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                                    activeTab === 'versioning'
                                        ? "bg-background shadow-sm text-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <GitBranch className="w-3.5 h-3.5" />
                                <span>Git</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('comments')}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                                    activeTab === 'comments'
                                        ? "bg-background shadow-sm text-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>Comments</span>
                            </button>
                        </div>

                        <button
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                            onClick={toggleCollapse}
                            title="Collapse sidebar"
                        >
                            <Minus className="w-3.5 h-3.5" />
                        </button>
                    </>
                )}

                {/* Collapsed Header Content (Vertical Icons) */}
                {isCollapsed && (
                    <>
                        <button
                            onClick={toggleCollapse}
                            className="p-1.5 hover:bg-secondary rounded mb-2 transition-colors"
                            title="Expand Sidebar"
                        >
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <div className="w-full h-[1px] bg-border mb-2" />

                        <button
                            onClick={() => { setActiveTab('browser'); setIsCollapsed(false); }}
                            className={cn(
                                "p-2 rounded mb-1 transition-colors",
                                activeTab === 'browser' ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                            )}
                            title="Browser"
                        >
                            <FolderTree className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => { setActiveTab('code'); setIsCollapsed(false); }}
                            className={cn(
                                "p-2 rounded mb-1 transition-colors",
                                activeTab === 'code' ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                            )}
                            title="Code Editor"
                        >
                            <Code className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => { setActiveTab('versioning'); setIsCollapsed(false); }}
                            className={cn(
                                "p-2 rounded mb-1 transition-colors",
                                activeTab === 'versioning' ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                            )}
                            title="Git"
                        >
                            <GitBranch className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => { setActiveTab('comments'); setIsCollapsed(false); }}
                            className={cn(
                                "p-2 rounded mb-1 transition-colors",
                                activeTab === 'comments' ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                            )}
                            title="Comments"
                        >
                            <MessageSquare className="w-4 h-4" />
                        </button>
                    </>
                )}
            </div>

            {/* Content Area - Only visible when not collapsed */}
            <div className={cn(
                "flex-1 overflow-hidden relative transition-opacity duration-300",
                isCollapsed ? "opacity-0 invisible" : "opacity-100 visible delay-100"
            )}>
                <div className={cn("absolute inset-0 flex flex-col", activeTab === 'browser' ? "z-10" : "-z-10 opacity-0 pointer-events-none")}>
                    <BrowserPanel />
                </div>

                <div className={cn("absolute inset-0 flex flex-col bg-[#1e1e1e]", activeTab === 'code' ? "z-10" : "-z-10 opacity-0 pointer-events-none")}>
                    <CodeEditorPanel />
                </div>

                <div className={cn("absolute inset-0 flex flex-col", activeTab === 'versioning' ? "z-10" : "-z-10 opacity-0 pointer-events-none")}>
                    <VersioningPanel />
                </div>

                <div className={cn("absolute inset-0 flex flex-col", activeTab === 'comments' ? "z-10" : "-z-10 opacity-0 pointer-events-none")}>
                    <CommentsPanel />
                </div>
            </div>

            {activeTab === 'browser' && (
                <div className={cn(
                    "mt-auto px-3 py-2 flex flex-col gap-2",
                    isCollapsed && "px-0 items-center"
                )}>
                    <div className="flex items-center gap-2 text-muted-foreground" title={`${objects.length} Objects, ${selectedIds.size} Selected`}>
                        <Box className="w-3 h-3" />
                        {!isCollapsed && (
                            <div className="flex items-center gap-1 text-[10px]">
                                <span>{objects.length} Objects</span>
                                {selectedIds.size > 0 && (
                                    <span className="text-primary font-medium">
                                        ({selectedIds.size})
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default UnifiedSidebar;

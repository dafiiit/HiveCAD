import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Search,
    Download,
    Upload,
    Plus,
    Folder,
    Globe,
    FileJson,
    FileBox,
    FileArchive,
    Library,
    GitBranch,
    History
} from "lucide-react";
import { useCADStore } from "@/hooks/useCADStore";
import { useGlobalStore } from "@/store/useGlobalStore";
import { toast } from "sonner";
import { ProjectData } from "@/lib/storage/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

interface FileManagerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const FileManagerDialog = ({ open, onOpenChange }: FileManagerDialogProps) => {
    const {
        syncToCloud,
        importFile,
        exportJSON,
        exportSTL,
        exportSTEP
    } = useCADStore();
    const { user } = useGlobalStore();

    const [searchQuery, setSearchQuery] = React.useState('');
    const [localProjects, setLocalProjects] = React.useState<ProjectData[]>([]);
    const [communityProjects, setCommunityProjects] = React.useState<any[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);

    // Load projects when dialog opens
    React.useEffect(() => {
        if (open && user?.pat) {
            loadProjects();
        }
    }, [open, user?.pat]);

    const loadProjects = async () => {
        setIsLoading(true);
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;
            if (adapter && adapter.listProjects) {
                const projects = await adapter.listProjects();
                // Sort by last modified (newest first)
                projects.sort((a, b) => b.lastModified - a.lastModified);
                setLocalProjects(projects);
            }
        } catch (error) {
            console.error('Failed to load local projects:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Search community projects & load trending on empty
    React.useEffect(() => {
        const timer = setTimeout(async () => {
            try {
                const { StorageManager } = await import('@/lib/storage/StorageManager');
                const adapter = StorageManager.getInstance().currentAdapter;

                if (adapter && adapter.searchCommunityProjects) {
                    // Pass empty string or specific flag to get popular/trending
                    // Assuming searchCommunityProjects handles empty query by returning popular items
                    // or we might need a dedicated method if the API requires it. 
                    // For now, attempting with empty string if the adapter supports it, 
                    // otherwise keeping the >= 2 char check for actual search.

                    if (searchQuery.length === 0) {
                        const results = await adapter.searchCommunityProjects('');
                        setCommunityProjects(results);
                    } else if (searchQuery.length >= 2) {
                        const results = await adapter.searchCommunityProjects(searchQuery);
                        setCommunityProjects(results);
                    } else {
                        // Keep current results if typing 1 char (or clear if strict)
                        // setCommunityProjects([]); 
                    }
                }
            } catch (error) {
                console.error('Community search failed:', error);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const filteredLocal = localProjects.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleImport = () => {
        importFile();
        onOpenChange(false);
    };

    const handleAddToProject = (project: any) => {
        toast.info(`Importing ${project.name} from ${project.owner || 'community'}... (Coming Soon)`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined} className="sm:max-w-[700px] h-[80vh] flex flex-col p-0 overflow-hidden border-border/40 bg-background/95 backdrop-blur-md rounded-[2rem] shadow-2xl">
                <DialogHeader className="p-8 pb-4 border-b border-border/10">
                    <div className="flex items-center justify-between mb-2">
                        <DialogTitle className="text-2xl font-bold bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
                            File Management
                        </DialogTitle>
                        <div className="flex items-center gap-2">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full gap-2 border-border/50 bg-background/50"
                                    >
                                        <Download className="w-4 h-4" />
                                        <span>Import</span>
                                        <ChevronDown className="w-3 h-3 opacity-50" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-xl border-border/40 bg-background/95 backdrop-blur-md">
                                    <DropdownMenuItem onClick={handleImport} className="gap-2 cursor-pointer rounded-lg">
                                        <FileJson className="w-4 h-4" />
                                        <span>JSON Format</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleImport} className="gap-2 cursor-pointer rounded-lg">
                                        <FileArchive className="w-4 h-4" />
                                        <span>STEP Format</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleImport} className="gap-2 cursor-pointer rounded-lg">
                                        <FileBox className="w-4 h-4" />
                                        <span>STL Format</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full gap-2 border-border/50 bg-background/50"
                                    >
                                        <Upload className="w-4 h-4" />
                                        <span>Export</span>
                                        <ChevronDown className="w-3 h-3 opacity-50" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-xl border-border/40 bg-background/95 backdrop-blur-md">
                                    <DropdownMenuItem onClick={() => exportJSON()} className="gap-2 cursor-pointer rounded-lg">
                                        <FileJson className="w-4 h-4" />
                                        <span>As JSON</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportSTEP()} className="gap-2 cursor-pointer rounded-lg">
                                        <FileArchive className="w-4 h-4" />
                                        <span>As STEP</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => exportSTL()} className="gap-2 cursor-pointer rounded-lg">
                                        <FileBox className="w-4 h-4" />
                                        <span>As STL</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    <div className="relative mt-4">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
                        <Input
                            placeholder="Search your projects or community models..."
                            className="pl-11 h-12 bg-background/40 backdrop-blur-xl border-border/30 focus-visible:ring-primary/20 rounded-2xl text-base shadow-inner"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 px-8 py-4 overflow-hidden">
                    <div className="scroll-smooth">
                        {/* Repository Section */}
                        <section className="mb-10">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-bold text-muted-foreground/50 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Library className="w-3 h-3" />
                                    Your Repository
                                </h3>
                                {isLoading && <div className="text-[10px] text-primary animate-pulse font-medium">Updating...</div>}
                            </div>

                            {filteredLocal.length > 0 ? (
                                <div className="grid grid-cols-2 gap-4">
                                    {filteredLocal.map(project => (
                                        <div
                                            key={project.id}
                                            className="group relative bg-muted/20 border border-border/40 rounded-2xl p-4 hover:bg-muted/30 hover:border-primary/30 transition-all duration-300 cursor-pointer overflow-hidden shadow-sm"
                                            onClick={async () => {
                                                const { StorageManager } = await import('@/lib/storage/StorageManager');
                                                const adapter = StorageManager.getInstance().currentAdapter;
                                                if (adapter) {
                                                    toast.success(`Opening ${project.name}`);
                                                    onOpenChange(false);
                                                }
                                            }}
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-background border border-border/50 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-all shadow-inner shrink-0 leading-tight">
                                                    {project.thumbnail ? (
                                                        <img src={project.thumbnail} alt="" className="w-full h-full object-cover rounded-lg" />
                                                    ) : (
                                                        <FileBox className="w-6 h-6 opacity-40" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 pr-6">
                                                    <div className="text-sm font-bold truncate mb-0.5 group-hover:text-primary transition-colors">{project.name}</div>
                                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 font-medium">
                                                        <History className="w-3 h-3 opacity-60" />
                                                        {new Date(project.lastModified).toLocaleDateString()}
                                                    </div>
                                                </div>
                                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <div className="p-1.5 rounded-full bg-primary/10 text-primary">
                                                        <Folder className="w-3.5 h-3.5" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-10 border-2 border-dashed border-border/20 rounded-2xl flex flex-col items-center justify-center text-muted-foreground/40 bg-muted/5">
                                    <Folder className="w-8 h-8 mb-2 opacity-20" />
                                    <p className="text-xs font-medium uppercase tracking-widest">{isLoading ? 'Loading projects...' : 'No projects found'}</p>
                                </div>
                            )}
                        </section>

                        {/* Community Section */}
                        <section className="mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-bold text-muted-foreground/50 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Globe className="w-3 h-3" />
                                    Community Models
                                </h3>
                            </div>

                            {communityProjects.length > 0 ? (
                                <div className="grid grid-cols-1 gap-3">
                                    {communityProjects.map(project => (
                                        <div
                                            key={project.id}
                                            className="group flex items-center gap-4 bg-muted/10 border border-border/20 rounded-2xl p-3 hover:bg-muted/20 hover:border-primary/20 transition-all duration-300"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-background border border-border/40 flex items-center justify-center shrink-0">
                                                {project.thumbnail ? (
                                                    <img src={project.thumbnail} alt="" className="w-full h-full object-cover rounded-lg" />
                                                ) : (
                                                    <Globe className="w-5 h-5 text-muted-foreground/30" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{project.name}</div>
                                                <div className="text-[10px] text-muted-foreground truncate opacity-70">by {project.owner}</div>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 rounded-full gap-2 opacity-0 group-hover:opacity-100 transition-all text-primary hover:bg-primary/10 hover:text-primary"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAddToProject(project);
                                                }}
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                <span className="text-[10px] font-bold">ADD TO PROJECT</span>
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground/30 border-2 border-dashed border-border/10 rounded-3xl bg-muted/5">
                                    {searchQuery.length === 0 ? (
                                        <>
                                            <Globe className="w-10 h-10 mb-3 opacity-10" />
                                            <p className="text-[11px] font-bold tracking-widest uppercase">Popular Community Models</p>
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-10 h-10 mb-3 opacity-10" />
                                            <p className="text-[11px] font-bold tracking-widest uppercase">No models found for "{searchQuery}"</p>
                                        </>
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

import React from 'react';
import {
    Star, MoreVertical, Trash2, Info, Tag, Folder, LayoutGrid, GitBranch, Share2
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProjectCardProps {
    project: any;
    onOpen: () => void;
    onToggleStar: (e: React.MouseEvent, name: string) => void;
    isStarred: boolean;
    onAction: () => void;
    showMenu: boolean;
    onDelete: () => void;
    onRename: () => void;
    onManageTags: () => void;
    onShare: () => void;
    onViewHistory: () => void;
    tags: Array<{ name: string; color: string }>;
    projectThumbnails: Record<string, string>;
    hasPAT: boolean;
    folders: Array<{ name: string; color: string }>;
    onMoveToFolder: (folderName: string | undefined) => void;
}

export function ProjectCard({
    project,
    onOpen,
    onToggleStar,
    isStarred,
    onAction,
    showMenu,
    onDelete,
    onRename,
    onManageTags,
    onShare,
    onViewHistory,
    tags,
    projectThumbnails,
    hasPAT,
    folders,
    onMoveToFolder,
}: ProjectCardProps) {
    const isExample = project.id?.startsWith('example-') || project.type === 'example' || project.ownerId === 'Example Project';

    // Thumbnail resolution order:
    // 1. Explicit project.thumbnail (if present, usually from modern storage index)
    // 2. Local store projectThumbnails[project.name] (base64 from local storage)
    // 3. Fallback for examples if no thumbnail exists AND no PAT is connected
    // 4. Fallback to constructed URL if project is on GitHub
    let thumbnail = project.thumbnail || projectThumbnails[project.name];

    if (!thumbnail && isExample) {
        if (project.id === 'example-gridfinity') thumbnail = '/previews/gridfinity.png';
    }

    if (!thumbnail && project.sha && !isExample) {
        thumbnail = `https://raw.githubusercontent.com/${project.ownerId}/hivecad-data/main/hivecad/thumbnails/${project.id}.png`;
    }

    const deleteMessage = project.deletedAt ? `Deleted ${Math.floor((Date.now() - project.deletedAt) / (1000 * 60 * 60 * 24))}d ago (Expires in ${7 - Math.floor((Date.now() - project.deletedAt) / (1000 * 60 * 60 * 24))}d)` : null;

    return (
        <div
            className={`group bg-card rounded-xl border border-border hover:border-primary/50 cursor-pointer transition-all hover:translate-y-[-4px] shadow-lg flex flex-col relative aspect-[4/3] h-auto ${showMenu ? 'z-50' : ''}`}
            onClick={onOpen}
        >
            <div className="flex-1 bg-muted flex items-center justify-center relative overflow-hidden rounded-t-xl">
                {thumbnail ? (
                    <img
                        src={thumbnail}
                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                        alt={project.name}
                        onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (isExample && target.src !== window.location.origin + '/previews/gridfinity.png') {
                                if (project.id === 'example-gridfinity') target.src = '/previews/gridfinity.png';
                                else target.style.display = 'none';
                            } else {
                                target.style.display = 'none';
                            }
                        }}
                    />
                ) : (
                    <LayoutGrid className={cn("w-12 h-12 transition-opacity", isExample ? "text-muted-foreground/30" : "text-primary/40")} />
                )}

                {/* Badges */}
                <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[70%]">
                    {(project.tags || []).map((tagName: string) => {
                        const tag = tags.find((t: any) => t.name === tagName);
                        return (
                            <div
                                key={tagName}
                                className="w-2 h-2 rounded-full border border-black/50 shadow-sm"
                                style={{ backgroundColor: tag?.color || '#ccc' }}
                                title={tagName}
                            />
                        );
                    })}
                </div>

                <div className={cn(
                    "absolute top-2 right-2 flex gap-1 transition-opacity",
                    isStarred || showMenu ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleStar(e, project.name); }}
                        className={`p-1.5 rounded-md border backdrop-blur-md transition-all ${isStarred ? 'bg-primary text-primary-foreground border-primary/70' : 'bg-card/90 border-border/70 text-muted-foreground hover:bg-card'}`}
                    >
                        <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-current' : ''}`} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onAction(); }}
                        className={`p-1.5 rounded-md border backdrop-blur-md transition-all ${showMenu ? 'bg-primary text-primary-foreground border-primary/70' : 'bg-card/90 border-border/70 text-muted-foreground hover:bg-card'}`}
                    >
                        <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                </div>

                {project.deletedAt && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                        <div className="bg-red-500/20 text-red-500 text-[10px] font-black px-2 py-1 rounded border border-red-500/30 uppercase tracking-widest flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> TRASHED
                        </div>
                    </div>
                )}
            </div>

            <div className="p-3 bg-card border-t border-border relative rounded-b-xl">
                <div className="font-bold text-foreground truncate text-sm tracking-tight">{project.name}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-tighter font-black opacity-60 flex items-center justify-between">
                    <span>{isExample ? 'Example Project' : (project.ownerId || 'My Project')}</span>
                    {!isExample && !project.deletedAt && project.sha && <span className="text-green-500/80">Cloud</span>}
                    {project.folder && <span className="ml-2 text-primary opacity-80 flex items-center gap-1"><Folder className="w-2 h-2" /> {project.folder}</span>}
                </div>
                {deleteMessage && <div className="text-[9px] text-red-400 font-bold mt-1 uppercase tracking-tighter">{deleteMessage}</div>}
            </div>

            {/* Context Menu */}
            {showMenu && (
                <div className="absolute top-9 right-2 w-52 bg-popover border border-border rounded-lg shadow-2xl z-50 py-1.5 animate-in slide-in-from-top-2 duration-150">
                    <button onClick={(e) => { e.stopPropagation(); onRename(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3">
                        <Info className="w-3.5 h-3.5" /> RENAME PROJECT
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onManageTags(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3">
                        <Tag className="w-3.5 h-3.5 text-primary" /> MANAGE TAGS
                    </button>
                    {!isExample && (
                        <button onClick={(e) => { e.stopPropagation(); onShare(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3">
                            <Share2 className="w-3.5 h-3.5 text-blue-400" /> SHARE PROJECT
                        </button>
                    )}
                    {hasPAT && (
                        <button onClick={(e) => { e.stopPropagation(); onViewHistory(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3">
                            <GitBranch className="w-3.5 h-3.5 text-blue-400" /> HISTORY & BRANCHES
                        </button>
                    )}

                    {!isExample && folders && folders.length > 0 && (
                        <div className="relative group/folder">
                            <button className="w-full text-left px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 justify-between">
                                <div className="flex items-center gap-3">
                                    <Folder className="w-3.5 h-3.5 text-orange-400" /> MOVE TO...
                                </div>
                                <div className="text-[9px] text-muted-foreground/50">▶</div>
                            </button>
                            {/* Submenu */}
                            <div className="absolute right-full top-0 mr-1 w-48 bg-popover border border-border rounded-lg shadow-xl hidden group-hover/folder:block py-1">
                                {folders.map((f: any) => (
                                    <button
                                        key={f.name}
                                        onClick={(e) => { e.stopPropagation(); onMoveToFolder(f.name); onAction(); }}
                                        className="w-full text-left px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2"
                                    >
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                                        {f.name}
                                    </button>
                                ))}
                                <div className="h-px bg-border my-1" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); onMoveToFolder(undefined); onAction(); }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-muted-foreground/60 hover:bg-muted hover:text-foreground italic"
                                >
                                    Remove from folder
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="h-px bg-border my-1.5" />
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-500/10 flex items-center gap-3">
                        <Trash2 className="w-3.5 h-3.5" /> DELETE PROJECT
                    </button>
                </div>
            )}
        </div>
    );
}

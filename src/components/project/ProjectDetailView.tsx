import React, { useEffect, useState } from 'react';
import {
    Plus, Edit3, Users, Search,
    FolderOpen, FileText, Folder, ChevronRight
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { ProjectMeta, FolderEntry, CollaboratorRole } from '@/lib/storage/types';
import { resolveProjectThumbnail } from '@/lib/storage/thumbnail';

interface ProjectDetailViewProps {
    /** Breadcrumb path: array of folder entries from root → current */
    breadcrumb: FolderEntry[];
    project: FolderEntry;
    /** All folders (to find sub-projects if needed) */
    allFolders: FolderEntry[];
    models: ProjectMeta[];
    onNavigateBreadcrumb: (index: number) => void;
    onBack: () => void;
    onCreate3DModel: () => void;
    onCreateSubProject: () => void;
    onOpenSubProject: (folder: FolderEntry) => void;
    onOpen3DModel: (meta: ProjectMeta) => void;
    onDelete3DModel: (id: string) => void;
    onRename3DModel: (meta: ProjectMeta) => void;
    onUpdateProject: (updated: FolderEntry) => void;
    projectThumbnails: Record<string, string>;
}

export function ProjectDetailView({
    breadcrumb,
    project,
    allFolders,
    models,
    onNavigateBreadcrumb,
    onBack,
    onCreate3DModel,
    onCreateSubProject,
    onOpenSubProject,
    onOpen3DModel,
    onDelete3DModel,
    onRename3DModel,
    onUpdateProject,
    projectThumbnails,
}: ProjectDetailViewProps) {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [titleInput, setTitleInput] = useState(project.name);
    const [descInput, setDescInput] = useState(project.description || '');
    const [showCollabForm, setShowCollabForm] = useState(false);
    const [collabEmail, setCollabEmail] = useState('');
    const [collabRole, setCollabRole] = useState<CollaboratorRole>('viewer');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        setTitleInput(project.name);
        setDescInput(project.description || '');
        setIsEditingTitle(false);
        setIsEditingDesc(false);
        setShowCollabForm(false);
    }, [project.id, project.name, project.description]);

    // Sub-projects that belong to this project (direct children via parentId)
    const subProjects = allFolders.filter(f => f.parentId === project.id);

    // Filter models by search
    const filteredModels = models.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const filteredSubProjects = subProjects.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const hasSearchQuery = searchQuery.trim().length > 0;

    const handleSaveTitle = () => {
        if (titleInput.trim() && titleInput.trim() !== project.name) {
            onUpdateProject({ ...project, name: titleInput.trim() });
        }
        setIsEditingTitle(false);
    };

    const handleSaveDesc = () => {
        onUpdateProject({ ...project, description: descInput });
        setIsEditingDesc(false);
    };

    return (
        <div className="max-w-7xl mx-auto w-full space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-1 bg-card/60 border border-border/50 rounded-lg px-3 py-2 overflow-x-auto">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all shrink-0"
                >
                    <Folder className="w-3.5 h-3.5 text-primary" />
                    Dashboard
                </button>
                {breadcrumb.map((crumb, i) => (
                    <React.Fragment key={i}>
                        <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                        <button
                            onClick={() => onNavigateBreadcrumb(i)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold transition-all shrink-0 ${i === breadcrumb.length - 1
                                ? 'text-foreground bg-muted/30'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                }`}
                        >
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: crumb.color }} />
                            {crumb.name}
                        </button>
                    </React.Fragment>
                ))}
            </div>

            {/* Project Header — Compact inline */}
            <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                    {isEditingTitle ? (
                        <input
                            value={titleInput}
                            onChange={(e) => setTitleInput(e.target.value)}
                            onBlur={handleSaveTitle}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTitle();
                                if (e.key === 'Escape') { setTitleInput(project.name); setIsEditingTitle(false); }
                            }}
                            autoFocus
                            className="text-2xl font-black text-foreground bg-transparent border-b-2 border-primary outline-none w-full pb-1"
                        />
                    ) : (
                        <h1
                            className="text-2xl font-black text-foreground cursor-pointer hover:text-primary transition-colors group flex items-center gap-2 truncate"
                            onClick={() => setIsEditingTitle(true)}
                        >
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                            {project.name}
                            <Edit3 className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity shrink-0" />
                        </h1>
                    )}
                </div>

                {/* Collaborators inline — compact */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => setShowCollabForm(!showCollabForm)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                    >
                        <Users className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Only you</span>
                    </button>
                </div>
            </div>

            {/* Collab form (expandable) */}
            {showCollabForm && (
                <div className="bg-card border border-border rounded-xl p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex gap-2 items-center">
                        <input
                            value={collabEmail}
                            onChange={(e) => setCollabEmail(e.target.value)}
                            placeholder="Email address"
                            className="flex-1 bg-input/50 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/40"
                        />
                        <select
                            value={collabRole}
                            onChange={(e) => setCollabRole(e.target.value as CollaboratorRole)}
                            className="bg-input/50 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                        </select>
                        <Button
                            size="sm"
                            className="rounded-lg font-bold text-xs h-7"
                            onClick={() => { setCollabEmail(''); setShowCollabForm(false); }}
                        >
                            Invite
                        </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 italic mt-1.5">Coming soon</p>
                </div>
            )}

            {/* Description — compact clickable area */}
            {isEditingDesc ? (
                <div className="space-y-2">
                    <textarea
                        value={descInput}
                        onChange={(e) => setDescInput(e.target.value)}
                        placeholder="Describe your project..."
                        rows={3}
                        autoFocus
                        className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none placeholder:text-muted-foreground/40"
                    />
                    <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveDesc} className="rounded-full px-4 text-xs font-bold">Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setDescInput(project.description || ''); setIsEditingDesc(false); }} className="text-xs">Cancel</Button>
                    </div>
                </div>
            ) : (
                <div
                    onClick={() => setIsEditingDesc(true)}
                    className="bg-muted/10 border border-border/30 rounded-xl px-4 py-2.5 text-sm text-muted-foreground cursor-pointer hover:border-primary/30 hover:bg-muted/20 transition-all group"
                >
                    {project.description ? (
                        <p className="text-foreground/80 whitespace-pre-wrap text-sm">{project.description}</p>
                    ) : (
                        <p className="italic text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors text-xs">
                            Click to add a description...
                        </p>
                    )}
                </div>
            )}

            {/* Search inside project */}
            <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search in ${project.name}...`}
                    className="bg-card/50 border-border pl-11 h-11 w-full focus:ring-2 focus:ring-primary/20 focus:border-primary rounded-full text-sm shadow-sm transition-all hover:bg-card hover:shadow-md placeholder:text-muted-foreground/50"
                />
            </div>

            {/* Sub-Projects */}
            <section className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-2">
                    <FolderOpen className="w-3.5 h-3.5" />
                    Sub-Projects
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {/* New Sub-Project Card */}
                    <button
                        onClick={onCreateSubProject}
                        className="aspect-[4/3] bg-card border-2 border-dashed border-border hover:border-primary/50 hover:bg-secondary/50 rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-all group"
                    >
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Folder className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-xs">New Sub-Project</span>
                    </button>

                    {filteredSubProjects.map((sub, i) => (
                        <div
                            key={i}
                            onClick={() => onOpenSubProject(sub)}
                            className="aspect-[4/3] bg-card border border-border rounded-xl p-4 flex flex-col justify-between text-left group transition-all cursor-pointer shadow-sm hover:shadow-lg hover:border-primary/30"
                        >
                            <Folder className="w-6 h-6" style={{ color: sub.color }} />
                            <div>
                                <h4 className="font-bold text-sm text-zinc-200 group-hover:text-primary transition-colors truncate">
                                    {sub.name}
                                </h4>
                                {sub.description && (
                                    <p className="text-[10px] text-zinc-500 truncate mt-0.5">{sub.description}</p>
                                )}
                            </div>
                        </div>
                    ))}

                    {filteredSubProjects.length === 0 && (
                        <div className="col-span-full py-8 text-center space-y-2">
                            <div className="w-10 h-10 bg-muted/30 rounded-full flex items-center justify-center mx-auto text-muted-foreground/50">
                                <FolderOpen className="w-5 h-5" />
                            </div>
                            <p className="text-muted-foreground/60 text-sm">
                                {hasSearchQuery ? 'No sub-projects match your search' : 'No sub-projects yet'}
                            </p>
                        </div>
                    )}
                </div>
            </section>

            {/* 3D Models */}
            <section className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    3D Models
                    <span className="text-muted-foreground/50">({filteredModels.length})</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {/* New 3D Model Card */}
                    <button
                        onClick={onCreate3DModel}
                        className="aspect-[4/3] bg-primary/10 border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/20 rounded-xl flex flex-col items-center justify-center gap-2 text-primary transition-all group shadow-lg shadow-primary/5"
                    >
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Plus className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-sm">New 3D Model</span>
                    </button>

                    {/* Model Cards */}
                    {filteredModels.map((model) => {
                        const thumbnail = resolveProjectThumbnail(projectThumbnails, model.id, model.name, model.thumbnail);

                        return (
                            <div
                                key={model.id}
                                onClick={() => onOpen3DModel(model)}
                                className="aspect-[4/3] bg-card border border-border rounded-xl overflow-hidden cursor-pointer group transition-all hover:shadow-xl hover:border-primary/30 relative"
                            >
                                <div className="w-full h-2/3 bg-muted/30 flex items-center justify-center relative overflow-hidden">
                                    {thumbnail ? (
                                        <img
                                            src={thumbnail}
                                            alt={model.name}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="text-white font-bold text-xs uppercase tracking-widest">Open</span>
                                    </div>
                                </div>
                                <div className="p-2.5 flex items-center justify-between">
                                    <div className="truncate">
                                        <h4 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                                            {model.name}
                                        </h4>
                                        <p className="text-[10px] text-muted-foreground">
                                            {new Date(model.lastModified).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {filteredModels.length === 0 && (
                        <div className="col-span-full py-8 text-center space-y-2">
                            <div className="w-10 h-10 bg-muted/30 rounded-full flex items-center justify-center mx-auto text-muted-foreground/50">
                                <FileText className="w-5 h-5" />
                            </div>
                            <p className="text-muted-foreground/60 text-sm">
                                {hasSearchQuery ? 'No 3D models match your search' : 'No 3D models yet'}
                            </p>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}

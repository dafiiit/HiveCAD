import React, { useState } from 'react';
import {
    ArrowLeft, Plus, Edit3, Users, Share2, Trash2,
    MoreVertical, FolderOpen, FileText, Image as ImageIcon
} from 'lucide-react';
import { Button } from '../ui/button';
import type { ProjectMeta, FolderEntry, CollaboratorRole } from '@/lib/storage/types';

interface ProjectDetailViewProps {
    project: FolderEntry;
    models: ProjectMeta[];
    onBack: () => void;
    onCreate3DModel: () => void;
    onOpen3DModel: (meta: ProjectMeta) => void;
    onDelete3DModel: (id: string) => void;
    onRename3DModel: (meta: ProjectMeta) => void;
    onUpdateProject: (updated: FolderEntry) => void;
    projectThumbnails: Record<string, string>;
}

export function ProjectDetailView({
    project,
    models,
    onBack,
    onCreate3DModel,
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
        <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-left-4 duration-300">
            {/* Back Button */}
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
            >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-sm font-bold uppercase tracking-wider">Back to Dashboard</span>
            </button>

            {/* Project Header */}
            <div className="bg-card border border-border rounded-2xl p-8 space-y-6 shadow-lg">
                <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
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
                                className="text-3xl font-black text-foreground bg-transparent border-b-2 border-primary outline-none w-full pb-1"
                            />
                        ) : (
                            <h1
                                className="text-3xl font-black text-foreground cursor-pointer hover:text-primary transition-colors group flex items-center gap-3"
                                onClick={() => setIsEditingTitle(true)}
                            >
                                <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                                {project.name}
                                <Edit3 className="w-4 h-4 opacity-0 group-hover:opacity-50 transition-opacity" />
                            </h1>
                        )}
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                            {models.length} 3D Model{models.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                        Description
                    </label>
                    {isEditingDesc ? (
                        <div className="space-y-2">
                            <textarea
                                value={descInput}
                                onChange={(e) => setDescInput(e.target.value)}
                                placeholder="Describe your project... (supports markdown)"
                                rows={4}
                                autoFocus
                                className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none placeholder:text-muted-foreground/40"
                            />
                            <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveDesc} className="rounded-full px-4 text-xs font-bold">
                                    Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setDescInput(project.description || ''); setIsEditingDesc(false); }} className="text-xs">
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div
                            onClick={() => setIsEditingDesc(true)}
                            className="min-h-[60px] bg-muted/20 border border-border/50 rounded-xl px-4 py-3 text-sm text-muted-foreground cursor-pointer hover:border-primary/30 hover:bg-muted/30 transition-all group"
                        >
                            {project.description ? (
                                <p className="text-foreground/80 whitespace-pre-wrap">{project.description}</p>
                            ) : (
                                <p className="italic text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors">
                                    Click to add a project description...
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Collaborators (Future-Ready Placeholder) */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <h3 className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                            Collaborators
                        </h3>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCollabForm(!showCollabForm)}
                        className="text-xs font-bold rounded-full gap-1"
                    >
                        <Plus className="w-3 h-3" />
                        Add
                    </Button>
                </div>

                {showCollabForm && (
                    <div className="bg-muted/20 border border-border/50 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex gap-2">
                            <input
                                value={collabEmail}
                                onChange={(e) => setCollabEmail(e.target.value)}
                                placeholder="Email address"
                                className="flex-1 bg-input/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/40"
                            />
                            <select
                                value={collabRole}
                                onChange={(e) => setCollabRole(e.target.value as CollaboratorRole)}
                                className="bg-input/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <option value="viewer">Viewer</option>
                                <option value="editor">Editor</option>
                                <option value="admin">Admin</option>
                            </select>
                            <Button
                                size="sm"
                                className="rounded-lg font-bold"
                                onClick={() => {
                                    // Future: call API to add collaborator
                                    setCollabEmail('');
                                    setShowCollabForm(false);
                                }}
                            >
                                Invite
                            </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 italic">
                            Collaboration features are coming soon. Stay tuned!
                        </p>
                    </div>
                )}

                <p className="text-xs text-muted-foreground/60 italic">
                    Only you have access to this project.
                </p>
            </div>

            {/* 3D Models Grid */}
            <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    3D Models
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {/* New 3D Model Card */}
                    <button
                        onClick={onCreate3DModel}
                        className="aspect-[4/3] bg-primary/10 border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/20 rounded-xl flex flex-col items-center justify-center gap-3 text-primary transition-all group shadow-lg shadow-primary/5"
                    >
                        <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Plus className="w-7 h-7" />
                        </div>
                        <span className="font-bold text-lg">New 3D Model</span>
                    </button>

                    {/* Model Cards */}
                    {models.map((model) => (
                        <div
                            key={model.id}
                            onClick={() => onOpen3DModel(model)}
                            className="aspect-[4/3] bg-card border border-border rounded-xl overflow-hidden cursor-pointer group transition-all hover:shadow-xl hover:border-primary/30 relative"
                        >
                            {/* Thumbnail */}
                            <div className="w-full h-2/3 bg-muted/30 flex items-center justify-center relative overflow-hidden">
                                {projectThumbnails[model.name] ? (
                                    <img
                                        src={projectThumbnails[model.name]}
                                        alt={model.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                ) : (
                                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <span className="text-white font-bold text-xs uppercase tracking-widest">Open</span>
                                </div>
                            </div>
                            {/* Model Info */}
                            <div className="p-3 flex items-center justify-between">
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
                    ))}

                    {models.length === 0 && (
                        <div className="col-span-full py-12 text-center space-y-2">
                            <div className="w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center mx-auto text-muted-foreground/50">
                                <FileText className="w-6 h-6" />
                            </div>
                            <p className="text-muted-foreground/60 text-sm">No 3D models yet. Create your first one!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

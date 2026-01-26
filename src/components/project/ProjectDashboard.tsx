import React, { useState, useEffect, useCallback } from 'react';
import { useCADStore } from '@/hooks/useCADStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
    Plus, Search, Clock, User, Users, Tag, Globe, Trash2,
    MoreVertical, Grid, List as ListIcon, Folder, ChevronDown,
    Bell, HelpCircle, UserCircle, LayoutGrid, Info, Star, Settings, LogOut, RefreshCw, AlertTriangle
} from 'lucide-react';
import { EXAMPLES } from '@/lib/data/examples';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GitHubTokenDialog } from '../ui/GitHubTokenDialog';
import { ProjectData } from '@/lib/storage/types';
import { LoadingScreen } from '../ui/LoadingScreen';

type DashboardMode = 'workspace' | 'discover';

const DISCOVER_PROJECTS = [
    { id: 'd1', name: 'Precision Drone Frame', author: 'sky_builder', likes: 124, forks: 45, thumbnail: null },
    { id: 'd2', name: 'Gridfinity 4x4 Base', author: 'organizer_pro', likes: 89, forks: 21, thumbnail: null },
    { id: 'd3', name: 'Minimalist Pot', author: 'industrial_box', likes: 210, forks: 12, thumbnail: null },
    { id: 'd4', name: 'M3 Bolt Assortment', author: 'mech_man', likes: 56, forks: 8, thumbnail: null },
    { id: 'd5', name: 'Parametric Hinge', author: 'hinge_king', likes: 167, forks: 34, thumbnail: null },
    { id: 'd6', name: 'Custom Keyboard Case', author: 'clack_master', likes: 312, forks: 67, thumbnail: null },
];

export function ProjectDashboard() {
    const {
        user, logout, setFileName, setCode, projectThumbnails,
        reset, showPATDialog, setShowPATDialog, isStorageConnected,
        closeProject
    } = useCADStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [dashboardMode, setDashboardMode] = useState<DashboardMode>('workspace');
    const [activeNav, setActiveNav] = useState('Created by me');
    const [folders, setFolders] = useState<string[]>([]);
    const [starredProjects, setStarredProjects] = useState<string[]>([]);
    const [userProjects, setUserProjects] = useState<ProjectData[]>([]);
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState<{ name: string, color: string }[]>([]);
    const [activeTags, setActiveTags] = useState<string[]>([]);
    const [contextMenuProject, setContextMenuProject] = useState<string | null>(null);
    const [showRenameDialog, setShowRenameDialog] = useState<ProjectData | null>(null);
    const [renameInput, setRenameInput] = useState("");
    const [showTagDialog, setShowTagDialog] = useState<ProjectData | null>(null);
    const [tagNameInput, setTagNameInput] = useState("");
    const [tagColorInput, setTagColorInput] = useState("#fbbf24");
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

    const refreshProjects = useCallback(async () => {
        // If we have a PAT, we should wait until the cloud connection is ready
        if (user?.pat && !isStorageConnected) {
            console.log('[ProjectDashboard] Waiting for cloud connection...');
            return;
        }

        if (dashboardMode === 'workspace') {
            setLoading(true);
            try {
                const { StorageManager } = await import('@/lib/storage/StorageManager');
                const adapter = StorageManager.getInstance().currentAdapter;
                if (adapter.listProjects) {
                    const projects = await adapter.listProjects();
                    setUserProjects(projects);
                }
                if (adapter.listTags) {
                    const fetchedTags = await adapter.listTags();
                    setTags(fetchedTags);
                }
            } catch (error) {
                console.error("Failed to fetch projects or tags:", error);
            } finally {
                setLoading(false);
            }
        }
    }, [user?.pat, dashboardMode, isStorageConnected]);

    useEffect(() => {
        refreshProjects();
    }, [refreshProjects]);

    const handleCreateProject = () => {
        if (!user?.pat) {
            setShowPATDialog(true);
            return;
        }

        createProject();
    };

    const [exampleOpenedAt, setExampleOpenedAt] = useState<Record<string, number>>(() => {
        try {
            return JSON.parse(localStorage.getItem('hivecad_example_opens') || '{}');
        } catch {
            return {};
        }
    });

    const handleOpenProject = async (project: any) => {
        setLoadingMessage(`Loading ${project.name}...`);
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;

            // Mark as opened
            await adapter.updateMetadata(project.id, { lastOpenedAt: Date.now() });

            const data = await adapter.load(project.id);
            if (data) {
                setFileName(data.name || project.name);
                // Use data.files.code if it exists (modern storage structure) or fallback to data.code
                const codeToSet = data.files?.code ?? data.code;
                if (codeToSet !== undefined) {
                    setCode(codeToSet);
                }
                toast.success(`Opened project: ${data.name || project.name}`);
                refreshProjects();
            }
        } catch (error) {
            toast.error("Failed to open project");
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;

            // If it's an example project, we might need special handling if it's not yet in the user's storage
            const isExampleId = projectId.startsWith('example-');
            if (isExampleId) {
                const existing = userProjects.find(p => p.id === projectId);
                if (!existing) {
                    const example = EXAMPLES.find(e => e.id === projectId);
                    if (example) {
                        // Save it as a "deleted" project in the user's workspace
                        await adapter.save(projectId, {
                            ...example,
                            deletedAt: Date.now(),
                            ownerId: 'Example Project'
                        });
                        toast.success("Example project moved to Trash.");
                        await refreshProjects();
                        return;
                    }
                }
            }

            await adapter.delete(projectId);
            toast.success("Project moved to Trash. It will be permanently deleted in 1 week.");
            await refreshProjects();
        } catch (error) {
            console.error("Delete failed:", error);
            toast.error("Failed to delete project");
        }
    };

    const handleRenameProject = async (projectId: string, newName: string) => {
        if (!newName.trim()) return;
        setLoadingMessage(`Renaming to ${newName}...`);
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;
            await adapter.rename(projectId, newName.trim());
            toast.success("Project renamed successfully");
            setShowRenameDialog(null);
            setRenameInput("");
            await refreshProjects();
        } catch (error) {
            toast.error("Failed to rename project");
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleUpdateTags = async (projectId: string, tags: string[]) => {
        // Optimistic update
        setUserProjects(prev => prev.map(p =>
            p.id === projectId ? { ...p, tags } : p
        ));

        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;
            await adapter.updateMetadata(projectId, { tags });
            toast.success("Tags updated");
            // No need to refreshProjects immediately as we updated it optimistically
            // But we can do it in background to sync
            refreshProjects();
        } catch (error) {
            toast.error("Failed to update tags");
            // Revert update if failed
            refreshProjects();
        }
    };

    const handleCreateTag = async () => {
        if (!tagNameInput.trim()) return;
        const newTags = [...tags, { name: tagNameInput.trim(), color: tagColorInput }];
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;
            if (adapter.saveTags) {
                await adapter.saveTags(newTags);
                setTags(newTags);
                setTagNameInput("");
                toast.success(`Tag "${tagNameInput}" created`);
            }
        } catch (error) {
            toast.error("Failed to create tag");
        }
    };

    const handleDeleteTag = async (tagName: string) => {
        setLoadingMessage(`Deleting tag ${tagName}...`);
        const newTags = tags.filter(t => t.name !== tagName);
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;
            if (adapter.saveTags) {
                await adapter.saveTags(newTags);
                setTags(newTags);

                // Update all projects to remove this tag
                const projectsToUpdate = userProjects.filter(p => p.tags?.includes(tagName));
                for (const project of projectsToUpdate) {
                    const updatedTags = project.tags?.filter(t => t !== tagName) || [];
                    await adapter.updateMetadata(project.id, { tags: updatedTags });
                }

                if (activeTags.includes(tagName)) {
                    setActiveTags(prev => prev.filter(t => t !== tagName));
                }

                toast.success(`Tag "${tagName}" deleted`);
                await refreshProjects();
            }
        } catch (error) {
            toast.error("Failed to delete tag");
        } finally {
            setLoadingMessage(null);
        }
    };

    const createProject = () => {
        const existingNames = Object.keys(projectThumbnails);
        let name = 'Unnamed';
        let counter = 1;

        while (existingNames.includes(name)) {
            counter++;
            name = `Unnamed ${counter}`;
        }

        setFileName(name);
        reset();
        toast.success(`Started new project: ${name}`);
    };

    const handleResetRepository = async () => {
        setLoadingMessage("Purging Repository...");
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;

            if (adapter.resetRepository) {
                // 1. Clear GitHub Repository
                await adapter.resetRepository();

                // 2. Clear Local State (Store)
                closeProject(); // Resets fileName, objects, code, etc.

                // 3. Clear LocalStorage
                localStorage.removeItem('hivecad_thumbnails');
                localStorage.removeItem('hivecad_example_opens');
                localStorage.removeItem('hivecad_thumbnails_cache');

                // 4. Reset Component State
                setStarredProjects([]);
                setFolders([]);
                setExampleOpenedAt({});

                toast.success("Repository and local data reset successfully.");

                // 5. Refresh from empty remote
                await refreshProjects();
                setShowResetConfirm(false);
            } else {
                toast.error("Reset functionality not supported by this storage adapter.");
            }
        } catch (error) {
            console.error("Reset failed:", error);
            toast.error("Failed to reset repository.");
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleAddFolder = () => {
        const name = window.prompt('Enter folder name:');
        if (name) {
            setFolders([...folders, name]);
            toast.success(`Folder "${name}" created`);
        }
    };

    const handleOpenExample = (example: typeof EXAMPLES[0]) => {
        const newOpens = { ...exampleOpenedAt, [example.id]: Date.now() };
        setExampleOpenedAt(newOpens);
        localStorage.setItem('hivecad_example_opens', JSON.stringify(newOpens));

        setFileName(example.name);
        setCode(example.code);
        toast.success(`Opened ${example.name}`);
    };

    const handleToggleStar = (e: React.MouseEvent, projectName: string) => {
        e.stopPropagation();
        setStarredProjects(prev =>
            prev.includes(projectName)
                ? prev.filter(p => p !== projectName)
                : [...prev, projectName]
        );
        toast.success(starredProjects.includes(projectName) ? `Removed from Starred` : `Added to Starred`);
    };

    const navItems = [
        { icon: User, label: 'Created by me' },
        { icon: Star, label: 'Starred' },
        { icon: Users, label: 'Shared with me' },
        { icon: Tag, label: 'Tags' },
        { icon: Globe, label: 'Public' },
        { icon: Trash2, label: 'Trash' },
    ];


    return (
        <div className="flex h-screen w-screen bg-[#1a1a1a] text-zinc-300 overflow-hidden font-sans flex-col">
            {/* Main Header */}
            <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#222] shrink-0">
                <div className="flex items-center gap-3 w-64">
                    <img src="/favicon.ico" alt="HiveCAD Logo" className="w-8 h-8 rounded-md" />
                    <span className="font-bold text-white text-lg tracking-tight">HiveCAD</span>
                </div>
                <div className="flex-1 flex justify-center">
                    <div className="bg-[#1a1a1a] p-1 rounded-lg flex border border-zinc-800">
                        <button
                            onClick={() => setDashboardMode('workspace')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${dashboardMode === 'workspace' ? 'bg-primary text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            MY WORKSPACE
                        </button>
                        <button
                            onClick={() => setDashboardMode('discover')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${dashboardMode === 'discover' ? 'bg-primary text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            DISCOVER
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-zinc-400 w-64 justify-end">
                    <Bell className="w-5 h-5 hover:text-white cursor-pointer" />
                    <HelpCircle className="w-5 h-5 hover:text-white cursor-pointer" />
                    <div className="flex items-center gap-2 pl-2 border-l border-zinc-700 ml-2 relative">
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-white">
                            {user?.email[0].toUpperCase()}
                        </div>
                        <span className="text-sm hidden sm:inline whitespace-nowrap">{user?.email}</span>

                        <div className="relative">
                            <button
                                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                                className="p-1.5 hover:bg-zinc-800 rounded-md transition-colors"
                                title="Settings"
                            >
                                <Settings className="w-5 h-5" />
                            </button>

                            {showSettingsMenu && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setShowSettingsMenu(false)}
                                    />
                                    <div className="absolute right-0 mt-2 w-56 bg-[#222] border border-zinc-800 rounded-lg shadow-2xl z-50 py-1.5 animate-in slide-in-from-top-2 duration-150">
                                        <button
                                            onClick={() => {
                                                setShowSettingsMenu(false);
                                                logout();
                                            }}
                                            className="w-full text-left px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-3"
                                        >
                                            <LogOut className="w-3.5 h-3.5" /> LOG OUT
                                        </button>
                                        <div className="h-px bg-zinc-800 my-1.5" />
                                        <button
                                            onClick={() => {
                                                setShowSettingsMenu(false);
                                                setShowResetConfirm(true);
                                            }}
                                            className="w-full text-left px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 flex items-center gap-3"
                                        >
                                            <RefreshCw className="w-3.5 h-3.5" /> RESET REPOSITORY
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Dashboard Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#1a1a1a]">
                {dashboardMode === 'workspace' ? (
                    <>
                        {/* Search and Navigation Tags */}
                        <div className="space-y-4">
                            <div className="max-w-xl relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={`Search in my HiveCAD...`}
                                    className="bg-[#222] border-zinc-800 pl-10 h-10 focus:ring-primary focus:border-zinc-700"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {navItems.map((item) => (
                                    <button
                                        key={item.label}
                                        onClick={() => {
                                            setActiveNav(item.label);
                                            setActiveTags([]);
                                        }}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${activeNav === item.label && activeTags.length === 0
                                            ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]'
                                            : 'bg-zinc-800/30 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                            }`}
                                    >
                                        <item.icon className="w-3 h-3" />
                                        {item.label.toUpperCase()}
                                    </button>
                                ))}
                            </div>

                            {activeNav === 'Tags' && (
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800/50 mt-4">
                                    {tags.map(tag => {
                                        const isSelected = activeTags.includes(tag.name);
                                        return (
                                            <button
                                                key={tag.name}
                                                onClick={() => {
                                                    setActiveTags(prev =>
                                                        isSelected
                                                            ? prev.filter(t => t !== tag.name)
                                                            : [...prev, tag.name]
                                                    );
                                                }}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black transition-all border ${isSelected
                                                    ? 'bg-white/10 border-white text-white shadow-lg'
                                                    : 'bg-zinc-800/30 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                                    }`}
                                                style={{ borderColor: isSelected ? tag.color : undefined }}
                                            >
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                                {tag.name.toUpperCase()}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Recent Section - Filtered to non-deleted */}
                        {activeNav === 'Created by me' && activeTags.length === 0 && searchQuery === '' && (
                            <section>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-semibold flex items-center gap-2 text-zinc-400 uppercase tracking-wider">
                                        <Clock className="w-4 h-4" /> Last opened by me
                                    </h3>
                                    {/* ... view mode buttons ... */}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                    <div onClick={handleCreateProject} className="bg-primary/5 rounded-md overflow-hidden border border-primary/20 border-dashed hover:border-primary hover:bg-primary/10 cursor-pointer group transition-all hover:translate-y-[-4px] shadow-lg flex flex-col ring-1 ring-primary/10 hover:ring-primary/30 h-48">
                                        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
                                            <Plus className="w-12 h-12 text-primary group-hover:scale-110 transition-transform duration-300" />
                                        </div>
                                        <div className="p-3 bg-[#2d2d2d] border-t border-zinc-800">
                                            <div className="font-bold text-primary group-hover:text-white transition-colors truncate text-sm tracking-tight">+ New Project</div>
                                            <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest font-black opacity-60">Create Space</div>
                                        </div>
                                    </div>

                                    {loading && <div className="col-span-1 h-48 bg-zinc-800/30 animate-pulse rounded-md" />}

                                    {(() => {
                                        const combined = [
                                            ...userProjects.filter(p => !p.deletedAt).map(p => ({ ...p, type: 'user' })),
                                            ...EXAMPLES
                                                .filter(e => !userProjects.some(up => up.id === e.id)) // Filter out if user has a persistent copy
                                                .map(e => ({ ...e, type: 'example' as const, lastOpenedAt: exampleOpenedAt[e.id] }))
                                        ]
                                            .sort((a, b) => {
                                                const timeA = a.lastOpenedAt || (a as any).lastModified || 0;
                                                const timeB = b.lastOpenedAt || (b as any).lastModified || 0;
                                                return timeB - timeA;
                                            })
                                            .slice(0, 3);

                                        return combined.map((project: any) => (
                                            <ProjectCard
                                                key={`${project.type}-${project.id}`}
                                                project={project}
                                                onOpen={() => project.type === 'example' ? handleOpenExample(project) : handleOpenProject(project)}
                                                onToggleStar={(e) => handleToggleStar(e, project.name)}
                                                isStarred={starredProjects.includes(project.name)}
                                                onAction={() => project.type === 'user' ? setContextMenuProject(project.id === contextMenuProject ? null : project.id) : null}
                                                showMenu={contextMenuProject === project.id}
                                                onDelete={() => handleDeleteProject(project.id)}
                                                onRename={() => {
                                                    setShowRenameDialog(project);
                                                    setRenameInput(project.name);
                                                }}
                                                onManageTags={() => {
                                                    setShowTagDialog(project);
                                                    setTagNameInput(""); // Reset creation input in dialog
                                                }}
                                                tags={tags}
                                                projectThumbnails={projectThumbnails}
                                            />
                                        ));
                                    })()}
                                </div>
                            </section>
                        )}

                        {/* Filtered Grid Section */}
                        <section>
                            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4 text-zinc-400 uppercase tracking-wider">
                                <ListIcon className="w-4 h-4" /> {activeTags.length > 0 ? `TAGS: ${activeTags.join(' + ')}` : activeNav}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {!loading && [
                                    ...userProjects.map(p => ({ ...p, type: 'user' as const })),
                                    ...EXAMPLES
                                        .filter(e => !userProjects.some(up => up.id === e.id))
                                        .map(e => ({ ...e, type: 'example' as const }))
                                ]
                                    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                    .filter(p => {
                                        // Ensure p.deletedAt is handled for both user and example projects
                                        const isDeleted = (p as any).deletedAt;
                                        if (activeNav === 'Trash') return !!isDeleted;
                                        if (isDeleted) return false;

                                        // Ensure p.tags is handled for both user and example projects
                                        const projectTags = (p as any).tags || [];
                                        if (activeTags.length > 0) {
                                            // Intersection: project must have ALL select tags
                                            return activeTags.every(t => projectTags.includes(t));
                                        }
                                        const isStarred = starredProjects.includes(p.name);
                                        if (activeNav === 'Starred') return isStarred;
                                        if (activeNav === 'Created by me') return p.type === 'user' || p.ownerId === 'Example Project';
                                        if (activeNav === 'Shared with me') return false;
                                        if (activeNav === 'Tags') return (p.type === 'user' || p.ownerId === 'Example Project') && projectTags.length > 0;
                                        if (activeNav === 'Public') return true;
                                        return true;
                                    })
                                    .map((project: any) => (
                                        <ProjectCard
                                            key={`filtered-${project.id}`}
                                            project={project}
                                            onOpen={() => project.type === 'example' ? handleOpenExample(project) : handleOpenProject(project)}
                                            onToggleStar={(e) => handleToggleStar(e, project.name)}
                                            isStarred={starredProjects.includes(project.name)}
                                            onAction={() => setContextMenuProject(project.id === contextMenuProject ? null : project.id)}
                                            showMenu={contextMenuProject === project.id}
                                            onDelete={() => handleDeleteProject(project.id)}
                                            onRename={() => {
                                                setShowRenameDialog(project);
                                                setRenameInput(project.name);
                                            }}
                                            onManageTags={() => {
                                                setShowTagDialog(project);
                                                setTagNameInput(""); // Reset creation input in dialog
                                            }}
                                            tags={tags}
                                            projectThumbnails={projectThumbnails}
                                        />
                                    ))}
                                {userProjects.filter(p => !p.deletedAt).length === 0 && EXAMPLES.length === 0 && (
                                    <div className="col-span-full py-20 text-center space-y-3">
                                        <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto text-zinc-600">
                                            <Search className="w-8 h-8" />
                                        </div>
                                        <div className="text-zinc-500 font-medium">No projects found in {activeNav}</div>
                                        <p className="text-zinc-600 text-sm">Try exploring the community in Discover mode or create a new project.</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </>
                ) : (
                    /* Discover Mode - Community Section */
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-white tracking-tight">Community Discover</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-500">Trending</span>
                                <ChevronDown className="w-4 h-4 text-zinc-500" />
                            </div>
                        </div>

                        {/* Pinterest-style Staggered Grid */}
                        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                            {DISCOVER_PROJECTS.map((item) => (
                                <div
                                    key={item.id}
                                    className="break-inside-avoid bg-[#222] rounded-xl overflow-hidden border border-zinc-800 hover:border-primary/40 transition-all cursor-pointer group shadow-xl"
                                >
                                    <div
                                        className="w-full bg-zinc-800/50 flex items-center justify-center"
                                        style={{ height: `${150 + (parseInt(item.id[1]) * 40)}px` }}
                                    >
                                        <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                            <LayoutGrid className="w-8 h-8" />
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div className="font-bold text-white text-sm leading-tight group-hover:text-primary transition-colors">{item.name}</div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] text-white">
                                                    {item.author[0].toUpperCase()}
                                                </div>
                                                <span className="text-[10px] text-zinc-500 font-medium">@{item.author}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                                                <div className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {item.forks}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            {showRenameDialog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#2a2a2a] border border-zinc-800 rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
                        <h4 className="text-xl font-bold text-white mb-4">Rename Project</h4>
                        <input
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameProject(showRenameDialog.id, renameInput);
                                if (e.key === 'Escape') setShowRenameDialog(null);
                            }}
                            autoFocus
                            className="w-full bg-[#1a1a1a] border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary mb-6"
                        />
                        <div className="flex justify-end gap-3">
                            <Button variant="ghost" onClick={() => setShowRenameDialog(null)}>Cancel</Button>
                            <Button onClick={() => handleRenameProject(showRenameDialog.id, renameInput)}>
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {showTagDialog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#2a2a2a] border border-zinc-800 rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <h4 className="text-xl font-bold text-white mb-1">Manage Tags</h4>
                        <p className="text-zinc-500 text-xs mb-6 font-medium uppercase tracking-widest">For: {showTagDialog.name}</p>

                        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                            {/* Create New Tag Section */}
                            <div className="bg-[#1a1a1a] p-4 rounded-xl border border-zinc-800/50 space-y-4">
                                <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Create New Tag</h5>
                                <div className="flex gap-2">
                                    <div className="flex-1 relative">
                                        <input
                                            value={tagNameInput}
                                            onChange={e => setTagNameInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
                                            placeholder="Tag name..."
                                            className="w-full bg-[#222] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:ring-1 focus:ring-primary outline-none"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 bg-[#222] border border-zinc-800 rounded-lg px-2">
                                        <input
                                            type="color"
                                            value={tagColorInput}
                                            onChange={e => setTagColorInput(e.target.value)}
                                            className="w-6 h-6 bg-transparent border-none cursor-pointer"
                                        />
                                    </div>
                                    <Button
                                        onClick={handleCreateTag}
                                        className="h-9 w-9 p-0 bg-primary/20 hover:bg-primary text-primary hover:text-white"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </Button>
                                </div>
                            </div>

                            {/* Existing Tags List */}
                            <div className="space-y-3">
                                <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Select Tags</h5>
                                <div className="grid grid-cols-2 gap-2">
                                    {tags.map(tag => {
                                        const isSelected = showTagDialog.tags?.includes(tag.name);
                                        return (
                                            <div key={tag.name} className="relative group/tag">
                                                <button
                                                    onClick={() => {
                                                        const currentTags = showTagDialog.tags || [];
                                                        const newTags = isSelected
                                                            ? currentTags.filter(l => l !== tag.name)
                                                            : [...currentTags, tag.name];
                                                        setShowTagDialog({ ...showTagDialog, tags: newTags });
                                                    }}
                                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-bold transition-all ${isSelected
                                                        ? 'bg-zinc-800/50 border-primary text-white shadow-[0_0_15px_rgba(var(--primary),0.1)]'
                                                        : 'bg-[#1a1a1a] border-zinc-800 text-zinc-500 hover:border-zinc-700'
                                                        }`}
                                                >
                                                    <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: tag.color }} />
                                                    <span className="truncate uppercase tracking-tight">{tag.name}</span>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteTag(tag.name)}
                                                    className="absolute top-1 right-1 p-1 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-md opacity-0 group-hover/tag:opacity-100 transition-all z-10"
                                                    title="Delete Tag"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-6 border-t border-zinc-800 mt-6 bg-[#2a2a2a]">
                            <Button variant="ghost" onClick={() => setShowTagDialog(null)}>Cancel</Button>
                            <Button
                                className="bg-primary hover:bg-primary/90 text-white font-bold px-6"
                                onClick={() => {
                                    handleUpdateTags(showTagDialog.id, showTagDialog.tags || []);
                                    setShowTagDialog(null);
                                }}
                            >
                                Apply Changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {showResetConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
                    <div className="bg-[#1a1a1a] border-2 border-red-500/30 rounded-2xl p-8 w-full max-w-lg shadow-[0_0_50px_rgba(239,68,68,0.2)] animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                                <AlertTriangle className="w-10 h-10" />
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-2xl font-black text-white uppercase tracking-tighter">Extreme Danger</h4>
                                <p className="text-zinc-400 text-sm leading-relaxed">
                                    You are about to <span className="text-red-400 font-bold underline">delete your entire HiveCAD repository</span> from GitHub.
                                    This will permanently erase all projects, tags, and settings history. This action cannot be undone.
                                </p>
                            </div>

                            <div className="w-full bg-red-500/5 border border-red-500/10 rounded-lg p-4 text-left">
                                <ul className="text-[10px] text-red-300 font-black uppercase tracking-widest space-y-2">
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-red-500 rounded-full" /> All JSON project files will be deleted</li>
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-red-500 rounded-full" /> Central index.json will be wiped</li>
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-red-500 rounded-full" /> Tag definitions will be destroyed</li>
                                </ul>
                            </div>

                            <div className="flex gap-4 w-full pt-4">
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-12 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
                                    onClick={() => setShowResetConfirm(false)}
                                    disabled={!!loadingMessage}
                                >
                                    ABORT MISSION
                                </Button>
                                <Button
                                    className="flex-1 h-12 bg-red-600 hover:bg-red-500 text-white font-black shadow-[0_0_20px_rgba(220,38,38,0.4)]"
                                    onClick={handleResetRepository}
                                    disabled={!!loadingMessage}
                                >
                                    {loadingMessage ? 'PURGING...' : 'I UNDERSTAND, RESET ALL'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {loadingMessage && <LoadingScreen message={loadingMessage} />}
        </div>
    );
}

function ProjectCard({ project, onOpen, onToggleStar, isStarred, onAction, showMenu, onDelete, onRename, onManageTags, tags, projectThumbnails }: any) {
    const isExample = project.type === 'example';

    // Thumbnail resolution order:
    // 1. Explicit project.thumbnail (if present, usually from modern storage index)
    // 2. Local store projectThumbnails[project.name] (base64 from local storage)
    // 3. Fallback to constructed URL if project is on GitHub
    let thumbnail = project.thumbnail || projectThumbnails[project.name];

    if (!thumbnail && project.sha && !isExample) {
        // Construct the raw GitHub URL for the isolated thumbnail
        // Note: This assumes the repo and owner are the current ones, which is true for 'user' projects
        // In a more robust implementation, we might store the full thumbnail URL in the index
        thumbnail = `https://raw.githubusercontent.com/${project.ownerId}/hivecad-projects/main/hivecad/thumbnails/${project.id}.png`;
    }

    const deleteMessage = project.deletedAt ? `Deleted ${Math.floor((Date.now() - project.deletedAt) / (1000 * 60 * 60 * 24))}d ago (Expires in ${7 - Math.floor((Date.now() - project.deletedAt) / (1000 * 60 * 60 * 24))}d)` : null;

    return (
        <div
            className="group bg-[#2d2d2d] rounded-md overflow-hidden border border-zinc-800 hover:border-primary/50 cursor-pointer transition-all hover:translate-y-[-4px] shadow-lg flex flex-col relative h-48"
            onClick={onOpen}
        >
            <div className="flex-1 bg-[#222] flex items-center justify-center relative overflow-hidden">
                {thumbnail ? (
                    <img src={thumbnail} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt={project.name} />
                ) : (
                    <LayoutGrid className={cn("w-12 h-12 transition-opacity", isExample ? "text-zinc-700" : "text-primary/40")} />
                )}

                {/* Badges */}
                <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[70%]">
                    {/* Ensure project.tags is handled for both user and example projects */}
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

                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleStar(e, project.name); }}
                        className={`p-1.5 rounded-md backdrop-blur-md transition-all ${isStarred ? 'bg-primary text-white' : 'bg-black/50 text-zinc-400'}`}
                    >
                        <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-white' : ''}`} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onAction(); }}
                        className={`p-1.5 rounded-md backdrop-blur-md transition-all ${showMenu ? 'bg-primary text-white' : 'bg-black/50 text-zinc-400'}`}
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

            <div className="p-3 bg-[#2d2d2d] border-t border-zinc-800 relative">
                <div className="font-bold text-white truncate text-sm tracking-tight">{project.name}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-tighter font-black opacity-60 flex items-center justify-between">
                    <span>{project.ownerId || (isExample ? 'Example Project' : 'My Project')}</span>
                    {!isExample && !project.deletedAt && project.sha && <span className="text-green-500/80">Cloud</span>}
                </div>
                {deleteMessage && <div className="text-[9px] text-red-400 font-bold mt-1 uppercase tracking-tighter">{deleteMessage}</div>}

                {/* Context Menu */}
                {showMenu && (
                    <div className="absolute bottom-full right-2 mb-2 w-48 bg-[#222] border border-zinc-800 rounded-lg shadow-2xl z-10 py-1.5 animate-in slide-in-from-bottom-2 duration-150">
                        <button onClick={(e) => { e.stopPropagation(); onRename(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-3">
                            <Info className="w-3.5 h-3.5" /> RENAME PROJECT
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onManageTags(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-3">
                            <Tag className="w-3.5 h-3.5 text-primary" /> MANAGE TAGS
                        </button>
                        <div className="h-px bg-zinc-800 my-1.5" />
                        <button onClick={(e) => { e.stopPropagation(); onDelete(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 flex items-center gap-3">
                            <Trash2 className="w-3.5 h-3.5" /> DELETE PROJECT
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

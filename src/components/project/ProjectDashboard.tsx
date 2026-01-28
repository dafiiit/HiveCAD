import React, { useState, useEffect, useCallback } from 'react';
import { useCADStore } from '@/hooks/useCADStore';
import { useGlobalStore } from '@/store/useGlobalStore';
import { useTabManager } from '@/components/layout/TabContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { UnifiedColorPicker } from '../ui/UnifiedColorPicker';
import {
    Plus, Search, Clock, User, Users, Tag, Globe, Trash2,
    MoreVertical, Grid, List as ListIcon, Folder, ChevronDown,
    Bell, HelpCircle, UserCircle, LayoutGrid, Info, Star, Settings, LogOut, RefreshCw, AlertTriangle, Github
} from 'lucide-react';
import { EXAMPLES } from '@/lib/data/examples';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ProjectData } from '@/lib/storage/types';
import { LoadingScreen } from '../ui/LoadingScreen';
import { ProjectHistoryView } from './ProjectHistoryView';
import { GitBranch } from 'lucide-react';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { CacheManager } from '@/lib/storage/CacheManager';

type DashboardMode = 'workspace' | 'discover';

// No placeholders needed anymore as we have real projects

export function ProjectDashboard() {
    const { openProjectInNewTab } = useTabManager();
    const { user, logout, showPATDialog, setShowPATDialog, isStorageConnected } = useGlobalStore();
    const {
        setFileName, setCode, projectThumbnails,
        reset, closeProject
    } = useCADStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [dashboardMode, setDashboardMode] = useState<DashboardMode>('workspace');
    const [activeNav, setActiveNav] = useState('Last Opened');
    const [folders, setFolders] = useState<{ name: string, color: string }[]>([]);
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
    const [showFolderDialog, setShowFolderDialog] = useState(false);
    const [folderNameInput, setFolderNameInput] = useState("");
    const [folderColorInput, setFolderColorInput] = useState("#3b82f6");
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [discoverProjects, setDiscoverProjects] = useState<any[]>([]);
    const [showHistoryDialog, setShowHistoryDialog] = useState<string | null>(null);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [contextMenuFolder, setContextMenuFolder] = useState<string | null>(null);
    const [renameFolderDialog, setRenameFolderDialog] = useState<{ name: string, color: string } | null>(null);
    const [renameFolderInput, setRenameFolderInput] = useState("");

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

                // 1. Fetch Remote Projects
                let remoteProjects: ProjectData[] = [];
                if (adapter.listProjects) {
                    try {
                        remoteProjects = await adapter.listProjects();
                    } catch (e) {
                        console.warn('Failed to fetch remote projects', e);
                    }
                }

                // 2. Fetch Local Projects (Offline/Unsynced)
                const { keys, getMany } = await import('idb-keyval');
                const allKeys = await keys();
                const projectKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('project:'));
                const localProjects = (await getMany(projectKeys)) as ProjectData[];

                // 3. Merge Strategies
                const projectMap = new Map<string, ProjectData>();

                // Add remote first
                remoteProjects.forEach(p => projectMap.set(p.id, p));

                // Add local (overwrite if newer or new)
                localProjects.forEach(p => {
                    if (!p || typeof p !== 'object' || !p.id || !p.name) return;

                    const existing = projectMap.get(p.id);
                    if (!existing) {
                        // It's a local-only project (newly created)
                        projectMap.set(p.id, p);
                    } else {
                        // Conflict: Check timestamps
                        // Usually local is newer if we are working on it
                        if ((p.lastModified || 0) > (existing.lastModified || 0)) {
                            projectMap.set(p.id, p);
                        }
                    }
                });

                // Filter out soft-deleted projects if not in trash view (Dashboard doesn't have trash view filter yet, assumes list returns active)
                // Actually adapter.listProjects might return all, so we filter here to be safe, 
                // but usually deleted projects are handled by `files` being null or `deletedAt`.
                const mergedProjects = Array.from(projectMap.values())
                    .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

                setUserProjects(mergedProjects);

                if (adapter.listTags) {
                    const fetchedTags = await adapter.listTags();
                    setTags(fetchedTags);
                }
                if (adapter.listFolders) {
                    const fetchedFolders = await adapter.listFolders();
                    setFolders(fetchedFolders);
                }
            } catch (error) {
                console.error("Failed to fetch projects or tags:", error);
            } finally {
                setLoading(false);
            }
        } else if (dashboardMode === 'discover') {
            setLoading(true);
            try {
                const { StorageManager } = await import('@/lib/storage/StorageManager');
                const adapter = StorageManager.getInstance().currentAdapter;
                if (adapter.searchCommunityProjects) {
                    const projects = await adapter.searchCommunityProjects(searchQuery);
                    setDiscoverProjects(projects);
                }
            } catch (error) {
                console.error("Failed to fetch discover projects:", error);
                setDiscoverProjects([]);
            } finally {
                setLoading(false);
            }
        }
    }, [user?.pat, dashboardMode, isStorageConnected, searchQuery]);

    useEffect(() => {
        refreshProjects();
        // Prune cache heavily
        CacheManager.pruneCache();
    }, [refreshProjects]);

    const handleCreateProject = () => {
        createProject();
    };

    const [exampleOpenedAt, setExampleOpenedAt] = useState<Record<string, number>>(() => {
        try {
            return JSON.parse(localStorage.getItem('hivecad_example_opens') || '{}');
        } catch {
            return {};
        }
    });

    const handleForkProject = async (project: any) => {
        setLoadingMessage(`Forking ${project.name}...`);
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const manager = StorageManager.getInstance();
            const adapter = manager.currentAdapter;

            // 1. Load external data
            const externalData = await manager.openExternalProject(project.owner, project.repo, project.id);
            if (!externalData) throw new Error("Failed to load source project");

            // 2. Prepare new project ID (to avoid conflicts)
            const newId = `${project.id}-fork-${Date.now().toString().slice(-4)}`;

            // 3. Save to user's own repo
            const forkData = {
                ...externalData,
                id: newId,
                name: `${externalData.name} (Fork)`,
                ownerId: user.email,
                lastModified: Date.now(),
            };

            await adapter.save(newId, forkData);

            // 4. Also copy thumbnail if exists
            if (project.thumbnail) {
                // We'd ideally fetch the image and re-save it, but for now we'll just let the new index entry use the old URL or wait for next save
                // Actually, save() already triggers the Supabase index update.
            }

            toast.success(`Forked "${project.name}" to your workspace!`);
            setDashboardMode('workspace');
            refreshProjects();
        } catch (error) {
            console.error("Fork failed:", error);
            toast.error("Failed to fork project");
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleOpenProject = async (project: any, versionSha?: string) => {
        setLoadingMessage(`Loading ${project.name}${versionSha ? ' (Version)...' : '...'}`);
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const manager = StorageManager.getInstance();
            const adapter = manager.currentAdapter;

            let data: ProjectData | null = null;

            if (project.owner && project.repo) {
                // External project from Discover
                data = await manager.openExternalProject(project.owner, project.repo, project.id);
            } else {
                // Own project
                // Mark as opened - Fire and Forget (Optimistic)
                if (!versionSha) {
                    adapter.updateMetadata(project.id, { lastOpenedAt: Date.now() })
                        .catch(e => console.warn("[ProjectDashboard] Failed to update lastOpenedAt", e));
                }

                // Check local storage first
                let localData: ProjectData | undefined;
                try {
                    // We check both ID-based and Name-based keys for backward compatibility
                    localData = await idbGet(`project:${project.id}`);
                    if (!localData && project.name) {
                        localData = await idbGet(`project:${project.name}`);
                    }
                } catch (e) {
                    console.warn("Failed to check local storage", e);
                }

                // If loading main version (not history) and we have local data
                if (!versionSha && localData) {
                    console.log("Loading from local cache (skipping remote fetch).");
                    data = localData;

                    // Safety: Trigger background sync to ensure local changes are pushed
                    // We must wait until the tab is opened and store initialized, 
                    // or we can do it via a flag. 
                    // Since openProjectInNewTab initializes memory, we can rely on `useBackgroundSync` 
                    // picking up `hasUnpushedChanges`.
                    // But `localData` from IDB doesn't necessarily have `hasUnpushedChanges` set to true in the object itself (it's a store flag).
                    // So we might need to set that flag when opening.
                } else {
                    data = await adapter.load(project.id, undefined, undefined, versionSha);

                    // Read-Through Caching: Save to local immediatelly
                    if (data && !versionSha) {
                        try {
                            // Ensure we cache with the stable ID-based key
                            console.log(`[ProjectDashboard] Caching project ${project.id} locally`);
                            await idbSet(`project:${project.id}`, data);
                        } catch (e) {
                            console.warn("Failed to update local cache", e);
                        }
                    }
                }
            }

            if (data) {
                // Open in new tab via context
                openProjectInNewTab(data);
                toast.success(`Opened project: ${data.name || project.name}${versionSha ? ' (Read Only)' : ''}`);
                if (!versionSha) refreshProjects();
            }
        } catch (error) {
            console.error("Failed to open project:", error);
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

            try {
                await adapter.rename(projectId, newName.trim());
            } catch (cloudError) {
                console.warn("[ProjectDashboard] Cloud rename failed, trying local update", cloudError);
                // Fallback: update local IndexedDB meta if it exists
                const localData: any = await idbGet(`project:${projectId}`);
                if (localData) {
                    const updated = { ...localData, name: newName.trim(), lastModified: Date.now() };
                    await idbSet(`project:${projectId}`, updated);
                } else {
                    throw cloudError; // Re-throw if no local either
                }
            }

            toast.success("Project renamed successfully");
            setShowRenameDialog(null);
            setRenameInput("");
            await refreshProjects();
        } catch (error) {
            console.error("Rename failed:", error);
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

    const createProject = async () => {
        const existingNames = Object.keys(projectThumbnails);
        let name = 'Unnamed';
        let counter = 1;

        while (existingNames.includes(name)) {
            counter++;
            name = `Unnamed ${counter}`;
        }

        // ✓ Generate stable projectId FIRST
        const projectId = Math.random().toString(36).substr(2, 9);
        console.log(`[ProjectDashboard] Creating project with ID: ${projectId}`);

        const newProjectData: ProjectData = {
            id: projectId,              // ✓ Use this ID consistently
            name: name,                 // ✓ User-visible name
            lastModified: Date.now(),
            files: { code: 'const main = () => { return; };' },
            version: '1.0.0',
            ownerId: user?.id || 'anon'
        };

        // ✓ Cache with projectId
        try {
            await idbSet(`project:${projectId}`, newProjectData);
            console.log(`[ProjectDashboard] Cached project ${projectId}`);
        } catch (e) {
            console.error("Failed to cache new project", e);
        }

        // Set default thumbnail to prevent broken images before first save
        // This is a simple 1x1 transparent pixel, or could be a branded placeholder
        const DEFAULT_THUMBNAIL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

        // We'll rely on openProjectInNewTab's internal logic, but we can also pre-seed the local storage
        try {
            const currentThumbnails = JSON.parse(localStorage.getItem('hivecad_thumbnails') || '{}');
            currentThumbnails[name] = DEFAULT_THUMBNAIL;
            localStorage.setItem('hivecad_thumbnails', JSON.stringify(currentThumbnails));
        } catch (e) {
            console.warn("Failed to set default thumbnail", e);
        }

        openProjectInNewTab(newProjectData);
        toast.success(`Started new project: ${name}`);

        // Refresh to show in list immediately (from local cache)
        refreshProjects();
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

                // 3b. Clear IndexedDB (Project Cache)
                try {
                    const { clear } = await import('idb-keyval');
                    await clear();
                    console.log('[ProjectDashboard] IndexedDB cleared.');
                } catch (e) {
                    console.error("Failed to clear IndexedDB:", e);
                }

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
        setFolderNameInput("");
        setFolderColorInput("#3b82f6");
        setShowFolderDialog(true);
    };

    const handleCreateFolder = async () => {
        if (!folderNameInput.trim()) return;
        const newFolders = [...folders, { name: folderNameInput.trim(), color: folderColorInput }];

        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;
            if (adapter.saveFolders) {
                await adapter.saveFolders(newFolders);
                setFolders(newFolders);
                toast.success(`Folder "${folderNameInput}" created`);
                setShowFolderDialog(false);
            } else {
                // Fallback for non-persistent adapters (memory only)
                setFolders(newFolders);
                setShowFolderDialog(false);
            }
        } catch (error) {
            toast.error("Failed to save folder");
        }
    };

    const handleRenameFolder = async () => {
        if (!renameFolderDialog || !renameFolderInput.trim()) return;
        const oldName = renameFolderDialog.name;
        const newName = renameFolderInput.trim();

        // 1. Update folder list
        const newFolders = folders.map(f => f.name === oldName ? { ...f, name: newName } : f);

        setLoadingMessage(`Renaming folder...`);
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;

            // Save new folders list
            if (adapter.saveFolders) {
                await adapter.saveFolders(newFolders);
                setFolders(newFolders);
            }

            // 2. Update all projects in this folder
            const projectsInFolder = userProjects.filter(p => p.folder === oldName);
            for (const project of projectsInFolder) {
                await adapter.updateMetadata(project.id, { folder: newName });
            }

            // Update UI state
            if (selectedFolder === oldName) setSelectedFolder(newName);
            toast.success("Folder renamed");
            setRenameFolderDialog(null);
            await refreshProjects();
        } catch (error) {
            toast.error("Failed to rename folder");
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleDeleteFolder = async (folderName: string) => {
        const confirm = window.confirm(`Are you sure you want to delete folder "${folderName}"? Projects inside will be moved to root.`);
        if (!confirm) return;

        setLoadingMessage(`Deleting folder...`);
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;

            // 1. Remove from list
            const newFolders = folders.filter(f => f.name !== folderName);
            if (adapter.saveFolders) {
                await adapter.saveFolders(newFolders);
                setFolders(newFolders);
            }

            // 2. Unassign projects
            const projectsInFolder = userProjects.filter(p => p.folder === folderName);
            for (const project of projectsInFolder) {
                // Remove folder property? Pass null or empty string?
                // Our updateMetadata is partial, so we might need to explicit set it to undefined or null.
                // Typescript types say string | undefined. 
                // We'll assume sending undefined/empty string to updateMetadata logic handles it, 
                // but usually undefined in JSON.stringify is omitted. 
                // We might need to send a specific "null" value if the backend supports it, or just re-save the whole project without the folder property.
                // For GitHubAdapter, 'save' overwrites. So 'updateMetadata' merges. 
                // Logic in updateMetadata: const updatedData = { ...data, ...updates, lastModified: Date.now() };
                // If updates has folder: undefined, it might keys overlap.
                // Let's coerce to any to allow delete.
                await adapter.updateMetadata(project.id, { folder: undefined } as any);
            }

            if (selectedFolder === folderName) setSelectedFolder(null);
            toast.success("Folder deleted");
            await refreshProjects();
        } catch (error) {
            toast.error("Failed to delete folder");
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleFolderColorChange = async (folderName: string, newColor: string) => {
        const newFolders = folders.map(f => f.name === folderName ? { ...f, color: newColor } : f);
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;
            if (adapter.saveFolders) {
                await adapter.saveFolders(newFolders);
                setFolders(newFolders);
            }
        } catch (error) {
            toast.error("Failed to update folder color");
        }
    };

    // Helper to move project to folder
    const handleMoveProjectToFolder = async (projectId: string, folderName: string | undefined) => {
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;
            // Force cast to any to ensure we can pass undefined to clear the field if needed, 
            // though updateMetadata handles partials so it should be fine.
            await adapter.updateMetadata(projectId, { folder: folderName });
            if (folderName) {
                toast.success(`Moved to ${folderName}`);
            } else {
                toast.success(`Removed from folder`);
            }
            refreshProjects();
        } catch (error) {
            toast.error("Failed to move project");
        }
    };

    const handleOpenExample = (example: typeof EXAMPLES[0]) => {
        const newOpens = { ...exampleOpenedAt, [example.id]: Date.now() };
        setExampleOpenedAt(newOpens);
        localStorage.setItem('hivecad_example_opens', JSON.stringify(newOpens));

        const projectData: ProjectData = {
            id: example.id,
            name: example.name,
            ownerId: 'Example Project',
            files: { code: example.code },
            version: '1.0.0',
            lastModified: Date.parse(example.modified),
            thumbnail: example.thumbnail
        };

        openProjectInNewTab(projectData);
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
        { icon: Clock, label: 'Last Opened' },
        { icon: User, label: 'Created by me' },
        { icon: Star, label: 'Starred' },
        { icon: Users, label: 'Shared with me' },
        { icon: Globe, label: 'Public by me' },
        { icon: Trash2, label: 'Trash' },
    ];


    return (
        <div className="flex h-screen w-screen bg-[#1a1a1a] text-zinc-300 overflow-hidden font-sans flex-col">
            {/* Main Header */}
            <header className="h-16 border-b border-border/40 flex items-center justify-between px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0 z-50">
                <div className="flex items-center gap-3 w-64">
                    <img src="/favicon.ico" alt="HiveCAD Logo" className="w-9 h-9 rounded-xl shadow-sm" />
                    <span className="font-bold text-foreground text-xl tracking-tight">HiveCAD</span>
                </div>
                <div className="flex-1 flex justify-center">
                    <div className="bg-muted/50 p-1.5 rounded-full flex border border-border/50 backdrop-blur-sm">
                        <button
                            onClick={() => setDashboardMode('workspace')}
                            className={`px-6 py-2 text-sm font-bold rounded-full transition-all duration-300 ${dashboardMode === 'workspace' ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                        >
                            MY WORKSPACE
                        </button>
                        <button
                            onClick={() => setDashboardMode('discover')}
                            className={`px-6 py-2 text-sm font-bold rounded-full transition-all duration-300 ${dashboardMode === 'discover' ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                        >
                            DISCOVER
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-muted-foreground w-64 justify-end">
                    <Bell className="w-5 h-5 hover:text-foreground cursor-pointer transition-colors" />
                    <HelpCircle className="w-5 h-5 hover:text-foreground cursor-pointer transition-colors" />
                    <div className="flex items-center gap-3 pl-4 border-l border-border ml-2 relative">
                        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground ring-2 ring-background">
                            {user?.email[0].toUpperCase()}
                        </div>
                        <span className="text-sm hidden sm:inline whitespace-nowrap font-medium text-foreground">{user?.email}</span>

                        <div className="relative">
                            <button
                                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                                className="p-2 hover:bg-secondary rounded-full transition-colors"
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
                                    <div className="absolute right-0 mt-3 w-60 bg-popover border border-border rounded-xl shadow-2xl z-50 py-2 animate-in slide-in-from-top-2 duration-150">
                                        <button
                                            onClick={() => {
                                                setShowSettingsMenu(false);
                                                setShowPATDialog(true);
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary flex items-center gap-3"
                                        >
                                            <Github className="w-4 h-4" /> GitHub Settings
                                        </button>
                                        <div className="h-px bg-border my-1.5" />
                                        <button
                                            onClick={() => {
                                                setShowSettingsMenu(false);
                                                logout();
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary flex items-center gap-3"
                                        >
                                            <LogOut className="w-4 h-4" /> Log Out
                                        </button>
                                        <div className="h-px bg-border my-1.5" />
                                        <button
                                            onClick={() => {
                                                setShowSettingsMenu(false);
                                                setShowResetConfirm(true);
                                            }}
                                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 flex items-center gap-3"
                                        >
                                            <RefreshCw className="w-4 h-4" /> Reset Repository
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Dashboard Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-10 bg-background/50">
                {dashboardMode === 'workspace' ? (
                    <>
                        <div className="max-w-7xl mx-auto w-full space-y-10">
                            {/* ROW 1: Folders */}
                            <section className="space-y-6">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Folders</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                                    {/* New Folder Card */}
                                    <button
                                        onClick={handleAddFolder}
                                        className="aspect-[4/3] bg-card border-2 border-dashed border-border hover:border-primary/50 hover:bg-secondary/50 rounded-2xl flex flex-col items-center justify-center gap-3 text-muted-foreground hover:text-foreground transition-all group"
                                    >
                                        <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                                            <Folder className="w-7 h-7" />
                                        </div>
                                        <span className="font-bold text-sm">New Folder</span>
                                    </button>

                                    {/* Existing Folders */}
                                    {folders.map((folder, i) => (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                if (selectedFolder === folder.name) {
                                                    setSelectedFolder(null);
                                                } else {
                                                    setSelectedFolder(folder.name);
                                                    setActiveNav('Tags');
                                                }
                                            }}
                                            className={`aspect-[4/3] bg-card border rounded-2xl p-5 flex flex-col justify-between text-left group transition-all relative overflow-visible cursor-pointer shadow-sm hover:shadow-lg ${selectedFolder === folder.name ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border hover:border-primary/30'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start relative z-10">
                                                <Folder className="w-8 h-8" style={{ color: folder.color }} />
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setContextMenuFolder(contextMenuFolder === folder.name ? null : folder.name);
                                                        }}
                                                        className="p-1 hover:bg-zinc-700 rounded-md transition-colors"
                                                    >
                                                        <MoreVertical className="w-4 h-4 text-zinc-500 hover:text-white" />
                                                    </button>
                                                </div>

                                                {/* Folder Context Menu */}
                                                {contextMenuFolder === folder.name && (
                                                    <div className="absolute top-8 right-0 w-56 bg-popover border border-border rounded-xl shadow-2xl z-50 py-2 animate-in slide-in-from-top-2 duration-150 ring-1 ring-black/5">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setContextMenuFolder(null);
                                                                setRenameFolderDialog(folder);
                                                                setRenameFolderInput(folder.name);
                                                            }}
                                                            className="w-full text-left px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-3"
                                                        >
                                                            <div className="w-3" /> RENAME
                                                        </button>
                                                        <div className="px-4 py-2">
                                                            <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-2">Color</label>
                                                            <UnifiedColorPicker
                                                                color={folder.color}
                                                                onChange={(c) => handleFolderColorChange(folder.name, c)}
                                                            />
                                                        </div>
                                                        <div className="h-px bg-border my-1.5" />
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteFolder(folder.name);
                                                            }}
                                                            className="w-full text-left px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 flex items-center gap-3"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" /> DELETE
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-zinc-200 group-hover:text-primary transition-colors truncate">{folder.name}</h4>
                                                <p className="text-[10px] text-zinc-500 font-medium">
                                                    {userProjects.filter(p => p.folder === folder.name && !p.deletedAt).length} projects
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* ROW 2: Search */}
                            <div className="max-w-2xl mx-auto w-full relative group">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={selectedFolder ? `Search in ${selectedFolder}...` : `Search in my HiveCAD...`}
                                    className="bg-card/50 border-border pl-14 h-14 w-full focus:ring-2 focus:ring-primary/20 focus:border-primary rounded-full text-lg shadow-sm transition-all hover:bg-card hover:shadow-md placeholder:text-muted-foreground/50"
                                />
                            </div>

                            {/* ROW 3: Tags (Single Line) */}
                            <div className="flex flex-wrap gap-2 justify-center items-center">
                                {navItems.map((item) => (
                                    <button
                                        key={item.label}
                                        onClick={() => {
                                            setActiveNav(item.label);
                                            setActiveTags([]);
                                            setSelectedFolder(null); // Clear folder selection when changing main nav
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all border ${activeNav === item.label && activeTags.length === 0 && !selectedFolder
                                            ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]'
                                            : 'bg-zinc-800/30 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                            }`}
                                    >
                                        <item.icon className="w-3.5 h-3.5" />
                                        {item.label.toUpperCase()}
                                    </button>
                                ))}
                                <div className="w-px h-6 bg-zinc-800 mx-2" />
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
                                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all border ${isSelected
                                                ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                                                }`}
                                            style={{ borderColor: isSelected ? tag.color : undefined }}
                                        >
                                            <div className="w-2.5 h-2.5 rounded-full ring-2 ring-background" style={{ backgroundColor: tag.color }} />
                                            {tag.name.toUpperCase()}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* ROW 4: Filtered Grid Section */}
                            <section>
                                <h3 className="text-sm font-semibold flex items-center gap-2 mb-4 text-zinc-400 uppercase tracking-wider px-1">
                                    {activeNav === 'Last Opened' && !selectedFolder && activeTags.length === 0 ? <Clock className="w-4 h-4" /> : <ListIcon className="w-4 h-4" />}
                                    {selectedFolder
                                        ? `FOLDER: ${selectedFolder}`
                                        : activeTags.length > 0
                                            ? `TAGS: ${activeTags.join(' + ')}`
                                            : activeNav === 'Last Opened'
                                                ? 'Last Opened'
                                                : activeNav
                                    }
                                    {selectedFolder && (
                                        <button onClick={() => setSelectedFolder(null)} className="ml-2 text-[10px] text-primary hover:underline">
                                            (Clear)
                                        </button>
                                    )}
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                    {/* New Project Card */}
                                    {activeNav !== 'Trash' && (
                                        <button
                                            onClick={handleCreateProject}
                                            className="aspect-[4/3] bg-primary/10 border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/20 rounded-xl flex flex-col items-center justify-center gap-3 text-primary transition-all group shadow-lg shadow-primary/5"
                                        >
                                            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <Plus className="w-7 h-7" />
                                            </div>
                                            <span className="font-bold text-lg">New Project</span>
                                        </button>
                                    )}

                                    {!loading && [
                                        ...userProjects.map(p => ({ ...p, type: 'user' as const })),
                                        ...EXAMPLES
                                            .filter(e => !userProjects.some(up => up.id === e.id))
                                            .map(e => ({ ...e, type: 'example' as const }))
                                    ]
                                        .filter(p => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
                                        .filter(p => {
                                            // Folder Filter
                                            if (selectedFolder) {
                                                if ((p as any).folder !== selectedFolder) return false;
                                            }

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
                                            if (activeNav === 'Last Opened') return (p.type === 'user' || p.ownerId === 'Example Project'); // All user projects + examples, will be sorted
                                            if (activeNav === 'Tags') return (p.type === 'user' || p.ownerId === 'Example Project') && projectTags.length > 0;
                                            if (activeNav === 'Public') return true;
                                            return true;
                                        })
                                        .sort((a: any, b: any) => {
                                            if (activeNav === 'Last Opened') {
                                                const timeA = a.lastOpenedAt || a.lastModified || 0;
                                                const timeB = b.lastOpenedAt || b.lastModified || 0;
                                                return timeB - timeA;
                                            }
                                            // Default sort (maybe name or creation?) - keeping existing behavior if any, 
                                            // currently map produces an array.
                                            // The previous separate "Recent" section did the sorting. 
                                            // Now we should sort by default or by last opened if that's the view.
                                            // Let's default to Last Modified if no specific sort is set for consistency.
                                            return (b.lastModified || 0) - (a.lastModified || 0);
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
                                                hasPAT={!!user?.pat}
                                                folders={folders}
                                                onMoveToFolder={(folderName: string) => handleMoveProjectToFolder(project.id, folderName)}
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
                        </div>
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
                            {discoverProjects.map((item) => (
                                <div
                                    key={item.id}
                                    onClick={() => handleOpenProject(item)}
                                    className="break-inside-avoid bg-[#222] rounded-xl overflow-hidden border border-zinc-800 hover:border-primary/40 transition-all cursor-pointer group shadow-xl"
                                >
                                    <div
                                        className="w-full bg-zinc-800/50 flex items-center justify-center relative aspect-video"
                                    >
                                        {item.thumbnail ? (
                                            <img
                                                src={item.thumbnail}
                                                alt={item.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = '';
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                                <LayoutGrid className="w-8 h-8" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 px-4">
                                            <Button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenProject(item);
                                                }}
                                                className="w-full bg-primary text-white font-bold rounded-full shadow-2xl scale-90 group-hover:scale-100 transition-transform"
                                            >
                                                OPEN PROJECT
                                            </Button>
                                            <Button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleForkProject(item);
                                                }}
                                                variant="outline"
                                                className="w-full bg-white/10 border-white/20 text-white font-bold rounded-full scale-90 group-hover:scale-100 transition-transform hover:bg-white/20"
                                            >
                                                FORK TO MY REPO
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div className="font-bold text-white text-sm leading-tight group-hover:text-primary transition-colors">{item.name}</div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] text-white uppercase">
                                                    {(item.author || item.owner || '?')[0]}
                                                </div>
                                                <span className="text-[10px] text-zinc-500 font-medium">@{item.author || item.owner}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                                                <div className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {item.forks || 0}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {discoverProjects.length === 0 && !loading && (
                            <div className="text-center py-20 text-zinc-500">
                                No community projects found. Be the first to publish!
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modals */}
            {showFolderDialog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-popover border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <h4 className="text-xl font-bold text-popover-foreground mb-4">Create New Folder</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1.5 block">Folder Name</label>
                                <input
                                    value={folderNameInput}
                                    onChange={(e) => setFolderNameInput(e.target.value)}
                                    // Handle Enter key
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleCreateFolder();
                                        if (e.key === 'Escape') setShowFolderDialog(false);
                                    }}
                                    autoFocus
                                    placeholder="e.g. Mechanical Parts"
                                    className="w-full bg-input/50 border border-input rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1.5 block">Folder Color</label>
                                <UnifiedColorPicker
                                    color={folderColorInput}
                                    onChange={setFolderColorInput}
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <Button variant="ghost" onClick={() => setShowFolderDialog(false)}>Cancel</Button>
                                <Button onClick={handleCreateFolder} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full px-6">
                                    Create Folder
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {renameFolderDialog && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-popover border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                        <h4 className="text-xl font-bold text-popover-foreground mb-4">Rename Folder</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1.5 block">New Folder Name</label>
                                <input
                                    value={renameFolderInput}
                                    onChange={(e) => setRenameFolderInput(e.target.value)}
                                    // Handle Enter key
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleRenameFolder();
                                        if (e.key === 'Escape') setRenameFolderDialog(null);
                                    }}
                                    autoFocus
                                    className="w-full bg-input/50 border border-input rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <Button variant="ghost" onClick={() => setRenameFolderDialog(null)}>Cancel</Button>
                                <Button onClick={handleRenameFolder} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-full px-6">
                                    Rename
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                    <div className="bg-popover border border-border rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <h4 className="text-xl font-bold text-white mb-1">Manage Tags</h4>
                        <p className="text-zinc-500 text-xs mb-6 font-medium uppercase tracking-widest">For: {showTagDialog.name}</p>

                        <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                            {/* Create New Tag Section */}
                            <div className="bg-card p-4 rounded-xl border border-border space-y-4">
                                <h5 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Create New Tag</h5>
                                <div className="flex gap-2 items-center">
                                    <div className="flex-1">
                                        <input
                                            value={tagNameInput}
                                            onChange={e => setTagNameInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
                                            placeholder="Tag name..."
                                            className="w-full bg-input/50 border border-input rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none"
                                        />
                                    </div>
                                    <UnifiedColorPicker
                                        color={tagColorInput}
                                        onChange={setTagColorInput}
                                    />
                                    <Button
                                        onClick={handleCreateTag}
                                        className="h-9 w-9 p-0 bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground rounded-full"
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

                        <div className="flex justify-end gap-3 pt-6 mt-6">
                            <Button variant="ghost" onClick={() => setShowTagDialog(null)}>Cancel</Button>
                            <Button
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 rounded-full"
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
                    <div className="bg-card border-2 border-destructive/30 rounded-2xl p-8 w-full max-w-lg shadow-[0_0_50px_rgba(239,68,68,0.2)] animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center text-destructive animate-pulse">
                                <AlertTriangle className="w-10 h-10" />
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-2xl font-black text-foreground uppercase tracking-tighter">Extreme Danger</h4>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    You are about to <span className="text-destructive font-bold underline">delete your entire HiveCAD repository</span> from GitHub.
                                    This will permanently erase all projects, tags, and settings history. This action cannot be undone.
                                </p>
                            </div>

                            <div className="w-full bg-destructive/5 border border-destructive/10 rounded-lg p-4 text-left">
                                <ul className="text-[10px] text-destructive/80 font-black uppercase tracking-widest space-y-2">
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-destructive rounded-full" /> All JSON project files will be deleted</li>
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-destructive rounded-full" /> Central index.json will be wiped</li>
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-destructive rounded-full" /> Tag definitions will be destroyed</li>
                                </ul>
                            </div>

                            <div className="flex gap-4 w-full pt-4">
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-12 border border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                                    onClick={() => setShowResetConfirm(false)}
                                    disabled={!!loadingMessage}
                                >
                                    ABORT MISSION
                                </Button>
                                <Button
                                    className="flex-1 h-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-black shadow-lg"
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

            <ProjectHistoryView
                isOpen={!!showHistoryDialog}
                onClose={() => setShowHistoryDialog(null)}
                projectId={showHistoryDialog || ''}
                onViewVersion={(sha) => {
                    const project = userProjects.find(p => p.id === showHistoryDialog);
                    if (project) {
                        setShowHistoryDialog(null);
                        handleOpenProject(project, sha);
                    }
                }}
            />
        </div>
    );
}

function ProjectCard({ project, onOpen, onToggleStar, isStarred, onAction, showMenu, onDelete, onRename, onManageTags, onViewHistory, tags, projectThumbnails, hasPAT, folders, onMoveToFolder }: any) {
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
        // Construct the raw GitHub URL for the isolated thumbnail
        // Note: This assumes the repo and owner are the current ones, which is true for 'user' projects
        // In a more robust implementation, we might store the full thumbnail URL in the index
        thumbnail = `https://raw.githubusercontent.com/${project.ownerId}/hivecad-projects/main/hivecad/thumbnails/${project.id}.png`;
    }

    const deleteMessage = project.deletedAt ? `Deleted ${Math.floor((Date.now() - project.deletedAt) / (1000 * 60 * 60 * 24))}d ago (Expires in ${7 - Math.floor((Date.now() - project.deletedAt) / (1000 * 60 * 60 * 24))}d)` : null;

    return (
        <div
            className={`group bg-card rounded-xl border border-border hover:border-primary/50 cursor-pointer transition-all hover:translate-y-[-4px] shadow-lg flex flex-col relative aspect-[4/3] h-auto ${showMenu ? 'z-50' : ''}`}
            onClick={onOpen}
        >
            <div className="flex-1 bg-[#2d2d2d] flex items-center justify-center relative overflow-hidden rounded-t-xl">
                {thumbnail ? (
                    <img
                        src={thumbnail}
                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                        alt={project.name}
                        onError={(e) => {
                            // If cloud thumbnail fails, try example fallback again or show icon
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
                    <LayoutGrid className={cn("w-12 h-12 transition-opacity", isExample ? "text-zinc-700" : "text-primary/40")} />
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
                <div className="absolute top-9 right-2 w-52 bg-[#222] border border-zinc-800 rounded-lg shadow-2xl z-50 py-1.5 animate-in slide-in-from-top-2 duration-150">
                    <button onClick={(e) => { e.stopPropagation(); onRename(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-3">
                        <Info className="w-3.5 h-3.5" /> RENAME PROJECT
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onManageTags(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-3">
                        <Tag className="w-3.5 h-3.5 text-primary" /> MANAGE TAGS
                    </button>
                    {hasPAT && (
                        <button onClick={(e) => { e.stopPropagation(); onViewHistory(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-3">
                            <GitBranch className="w-3.5 h-3.5 text-blue-400" /> HISTORY & BRANCHES
                        </button>
                    )}

                    {!isExample && folders && folders.length > 0 && (
                        <div className="relative group/folder">
                            <button className="w-full text-left px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-3 justify-between">
                                <div className="flex items-center gap-3">
                                    <Folder className="w-3.5 h-3.5 text-orange-400" /> MOVE TO...
                                </div>
                                <div className="text-[9px] text-zinc-500">▶</div>
                            </button>
                            {/* Submenu */}
                            <div className="absolute right-full top-0 mr-1 w-48 bg-[#222] border border-zinc-800 rounded-lg shadow-xl hidden group-hover/folder:block py-1">
                                {folders.map((f: any) => (
                                    <button
                                        key={f.name}
                                        onClick={(e) => { e.stopPropagation(); onMoveToFolder(f.name); onAction(); }}
                                        className="w-full text-left px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-2"
                                    >
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                                        {f.name}
                                    </button>
                                ))}
                                <div className="h-px bg-zinc-800 my-1" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); onMoveToFolder(undefined); onAction(); }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white italic"
                                >
                                    Remove from folder
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="h-px bg-zinc-800 my-1.5" />
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); onAction(); }} className="w-full text-left px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/10 flex items-center gap-3">
                        <Trash2 className="w-3.5 h-3.5" /> DELETE PROJECT
                    </button>
                </div>
            )}
        </div>
    );
}

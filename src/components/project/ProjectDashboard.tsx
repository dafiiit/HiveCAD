import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ProjectMeta, ProjectData, TagEntry, FolderEntry } from '@/lib/storage/types';
import { createBlankProject, uuid, DEFAULT_CODE } from '@/lib/storage/projectUtils';
import { StorageManager } from '@/lib/storage/StorageManager';
import { LoadingScreen } from '../ui/LoadingScreen';
import { ProjectHistoryView } from './ProjectHistoryView';
import { GitBranch } from 'lucide-react';
import { SettingsDialog } from '@/components/ui/SettingsDialog';
import { ProjectCard } from './ProjectCard';
import { EXAMPLES } from '@/lib/data/examples';

type DashboardMode = 'workspace' | 'discover';

export function ProjectDashboard() {
    const { openProjectInNewTab } = useTabManager();
    const { user, logout, showPATDialog, setShowPATDialog, isStorageConnected } = useGlobalStore();
    const {
        setFileName, setCode, projectThumbnails,
        reset, closeProject, removeThumbnail
    } = useCADStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [dashboardMode, setDashboardMode] = useState<DashboardMode>('workspace');
    const [activeNav, setActiveNav] = useState('Last Opened');
    const [folders, setFolders] = useState<FolderEntry[]>([]);
    const [starredProjects, setStarredProjects] = useState<string[]>([]);
    const [userProjects, setUserProjects] = useState<ProjectMeta[]>([]);
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState<TagEntry[]>([]);
    const [activeTags, setActiveTags] = useState<string[]>([]);
    const [contextMenuProject, setContextMenuProject] = useState<string | null>(null);
    const [showRenameDialog, setShowRenameDialog] = useState<ProjectMeta | null>(null);
    const [renameInput, setRenameInput] = useState("");
    const [showTagDialog, setShowTagDialog] = useState<ProjectMeta | null>(null);
    const [tagNameInput, setTagNameInput] = useState("");
    const [tagColorInput, setTagColorInput] = useState("#fbbf24");
    const [showFolderDialog, setShowFolderDialog] = useState(false);
    const [folderNameInput, setFolderNameInput] = useState("");
    const [folderColorInput, setFolderColorInput] = useState("#3b82f6");
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [discoverProjects, setDiscoverProjects] = useState<ProjectMeta[]>([]);
    const [showHistoryDialog, setShowHistoryDialog] = useState<string | null>(null);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [contextMenuFolder, setContextMenuFolder] = useState<string | null>(null);
    const [renameFolderDialog, setRenameFolderDialog] = useState<FolderEntry | null>(null);
    const [renameFolderInput, setRenameFolderInput] = useState("");
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<ProjectMeta | null>(null);
    const [deleteInput, setDeleteInput] = useState("");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isSyncingDashboard, setIsSyncingDashboard] = useState(false);
    const autoOpenHandledRef = useRef(false);

    // ─── Helpers ──────────────────────────────────────────────────────────

    const mgr = StorageManager.getInstance();

    // ─── Refresh Projects ─────────────────────────────────────────────────

    const refreshProjects = useCallback(async () => {
        if (user?.pat && !isStorageConnected) {
            console.log('[ProjectDashboard] Waiting for cloud connection...');
            return;
        }

        if (dashboardMode === 'workspace') {
            setLoading(true);
            try {
                // List all projects from QuickStore
                const metas = await mgr.quickStore.listProjects();
                setUserProjects(metas.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0)));

                // Load tags & folders from Supabase
                const userId = user?.id;
                if (userId && mgr.supabaseMeta) {
                    try {
                        const [fetchedTags, fetchedFolders] = await Promise.all([
                            mgr.supabaseMeta.getUserTags(userId),
                            mgr.supabaseMeta.getUserFolders(userId),
                        ]);
                        setTags(fetchedTags);
                        setFolders(fetchedFolders);
                    } catch (e) {
                        console.warn('Failed to fetch tags/folders', e);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch projects:", error);
            } finally {
                setLoading(false);
            }
        } else if (dashboardMode === 'discover') {
            setLoading(true);
            try {
                if (mgr.supabaseMeta) {
                    const projects = await mgr.supabaseMeta.searchPublicProjects(searchQuery);
                    setDiscoverProjects(projects);
                }
            } catch (error) {
                console.error("Failed to fetch discover projects:", error);
                setDiscoverProjects([]);
            } finally {
                setLoading(false);
            }
        }
    }, [user?.pat, user?.id, dashboardMode, isStorageConnected, searchQuery]);

    useEffect(() => {
        refreshProjects();
    }, [refreshProjects]);

    useEffect(() => {
        if (autoOpenHandledRef.current) {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const projectId = params.get('project');

        if (!projectId) {
            autoOpenHandledRef.current = true;
            return;
        }

        if (user?.pat && !isStorageConnected) {
            return;
        }

        const clearProjectQueryParam = () => {
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.delete('project');
            const nextQuery = nextUrl.searchParams.toString();
            const cleanedUrl = `${nextUrl.pathname}${nextQuery ? `?${nextQuery}` : ''}${nextUrl.hash}`;
            window.history.replaceState({}, '', cleanedUrl);
        };

        autoOpenHandledRef.current = true;
        let cancelled = false;

        const openSharedProject = async () => {
            setLoadingMessage('Opening shared project...');

            try {
                let data = await mgr.quickStore.loadProject(projectId);

                if (!data && mgr.isRemoteConnected) {
                    data = await mgr.remoteStore!.pullProject(projectId);
                    if (data) {
                        await mgr.quickStore.saveProject(data);
                    }
                }

                if (cancelled) {
                    return;
                }

                if (data) {
                    openProjectInNewTab(data);
                    toast.success(`Opened shared project: ${data.meta.name}`);
                    await refreshProjects();
                } else {
                    toast.error('Shared project could not be loaded');
                }
            } catch (error) {
                console.error('[ProjectDashboard] Failed to auto-open shared project:', error);
                toast.error('Failed to open shared project');
            } finally {
                if (!cancelled) {
                    setLoadingMessage(null);
                    clearProjectQueryParam();
                }
            }
        };

        void openSharedProject();

        return () => {
            cancelled = true;
        };
    }, [user?.pat, isStorageConnected, openProjectInNewTab, refreshProjects]);

    // ─── Create Project ───────────────────────────────────────────────────

    const handleCreateProject = async () => {
        const existingNames = userProjects.map(p => p.name);
        let name = 'Unnamed';
        let counter = 1;
        while (existingNames.includes(name)) {
            counter++;
            name = `Unnamed ${counter}`;
        }

        const projectId = uuid();
        console.log(`[ProjectDashboard] Creating project with ID: ${projectId}`);

        const newProject = createBlankProject({
            id: projectId,
            name,
            ownerId: user?.id || 'anon',
            ownerEmail: user?.email || '',
        });

        // Save to QuickStore and mark sync dirty
        try {
            await mgr.quickStore.saveProject(newProject);
            mgr.syncEngine?.markDirty();
        } catch (e) {
            console.error("Failed to save new project", e);
        }

        // Set default thumbnail
        const DEFAULT_THUMBNAIL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        try {
            const currentThumbnails = JSON.parse(localStorage.getItem('hivecad_thumbnails') || '{}');
            currentThumbnails[name] = DEFAULT_THUMBNAIL;
            localStorage.setItem('hivecad_thumbnails', JSON.stringify(currentThumbnails));
        } catch (e) {
            console.warn("Failed to set default thumbnail", e);
        }

        openProjectInNewTab(newProject);
        toast.success(`Started new project: ${name}`);
        refreshProjects();
    };

    // ─── Open Project ─────────────────────────────────────────────────────

    const handleOpenProject = async (meta: ProjectMeta) => {
        setLoadingMessage(`Loading ${meta.name}...`);
        try {
            let data: ProjectData | null = null;

            // Try loading from QuickStore first
            data = await mgr.quickStore.loadProject(meta.id);

            // Fallback: pull from remote
            if (!data && mgr.isRemoteConnected) {
                data = await mgr.remoteStore!.pullProject(meta.id);
                // Cache locally
                if (data) await mgr.quickStore.saveProject(data);
            }

            if (data) {
                openProjectInNewTab(data);
                toast.success(`Opened project: ${data.meta.name}`);
                refreshProjects();
            } else {
                toast.error("Project data not found");
            }
        } catch (error) {
            console.error("Failed to open project:", error);
            toast.error("Failed to open project");
        } finally {
            setLoadingMessage(null);
        }
    };

    // ─── Fork Project (Discover) ──────────────────────────────────────────

    const handleForkProject = async (meta: ProjectMeta) => {
        setLoadingMessage(`Forking ${meta.name}...`);
        try {
            // Pull the full project from remote
            let sourceData: ProjectData | null = null;
            if (mgr.isRemoteConnected) {
                sourceData = await mgr.remoteStore!.pullProject(meta.id);
            }
            if (!sourceData) throw new Error("Failed to load source project");

            const forkId = uuid();
            const forkedProject: ProjectData = {
                meta: {
                    ...sourceData.meta,
                    id: forkId,
                    name: `${sourceData.meta.name} (Fork)`,
                    ownerId: user?.id || 'anon',
                    ownerEmail: user?.email || '',
                    lastModified: Date.now(),
                    createdAt: Date.now(),
                    visibility: 'private',
                    lockedBy: null,
                },
                snapshot: { ...sourceData.snapshot },
                namespaces: { ...sourceData.namespaces },
            };

            await mgr.quickStore.saveProject(forkedProject);
            mgr.syncEngine?.markDirty();

            toast.success(`Forked "${meta.name}" to your workspace!`);
            setDashboardMode('workspace');
            refreshProjects();
        } catch (error) {
            console.error("Fork failed:", error);
            toast.error("Failed to fork project");
        } finally {
            setLoadingMessage(null);
        }
    };

    // ─── Open Example ─────────────────────────────────────────────────────

    const [exampleOpenedAt, setExampleOpenedAt] = useState<Record<string, number>>(() => {
        try {
            return JSON.parse(localStorage.getItem('hivecad_example_opens') || '{}');
        } catch {
            return {};
        }
    });

    const handleOpenExample = (example: typeof EXAMPLES[0]) => {
        const newOpens = { ...exampleOpenedAt, [example.id]: Date.now() };
        setExampleOpenedAt(newOpens);
        localStorage.setItem('hivecad_example_opens', JSON.stringify(newOpens));

        const projectData: ProjectData = {
            meta: {
                id: example.id,
                name: example.name,
                ownerId: 'Example Project',
                ownerEmail: '',
                description: '',
                visibility: 'public' as const,
                tags: [],
                folder: '',
                thumbnail: example.thumbnail || '',
                lastModified: Date.parse(example.modified),
                createdAt: Date.parse(example.modified),
                remoteProvider: '',
                remoteLocator: '',
                lockedBy: null,
            },
            snapshot: { code: example.code, objects: [] },
            namespaces: {},
        };

        openProjectInNewTab(projectData);
        toast.success(`Opened ${example.name}`);
    };

    // ─── Delete Project ───────────────────────────────────────────────────

    const handleDeleteProject = async (projectId: string) => {
        const project = userProjects.find(p => p.id === projectId);
        if (project) {
            setShowDeleteConfirm(project);
            setDeleteInput("");
        }
    };

    const handleConfirmDelete = async () => {
        if (!showDeleteConfirm) return;

        const projectId = showDeleteConfirm.id;
        const projectName = showDeleteConfirm.name;

        setUserProjects(prev => prev.filter(p => p.id !== projectId));
        setShowDeleteConfirm(null);
        toast.success(`Deleting "${projectName}"...`);

        try {
            // 1. Delete from QuickStore (this also writes a tombstone to prevent re-sync)
            await mgr.quickStore.deleteProject(projectId);

            // 2. Delete from GitHub remote
            if (mgr.isRemoteConnected) {
                try {
                    await mgr.remoteStore!.deleteProject(projectId);
                } catch (err) {
                    console.warn(`[ProjectDashboard] Failed to delete ${projectId} from remote (will retry on next sync):`, err);
                }
            }

            // 3. Delete from Supabase
            try {
                await mgr.supabaseMeta?.deleteProjectMeta(projectId);
            } catch (err) {
                console.warn(`[ProjectDashboard] Failed to delete ${projectId} from Supabase:`, err);
            }

            // 4. Clean up thumbnail
            removeThumbnail(projectName);

            console.log(`[ProjectDashboard] Deleted project "${projectName}" (${projectId}) from all stores`);
            toast.success(`Deleted "${projectName}"`);
            await refreshProjects();
        } catch (error) {
            console.error("Delete failed:", error);
            toast.error(`Failed to delete "${projectName}"`);
            await refreshProjects();
        }
    };

    // ─── Rename Project ───────────────────────────────────────────────────

    const handleRenameProject = async (projectId: string, newName: string) => {
        if (!newName.trim()) return;
        setLoadingMessage(`Renaming to ${newName}...`);
        try {
            const data = await mgr.quickStore.loadProject(projectId);
            if (data) {
                data.meta.name = newName.trim();
                data.meta.lastModified = Date.now();
                await mgr.quickStore.saveProject(data);
                // Mark sync dirty so rename propagates to GitHub + Supabase
                mgr.syncEngine?.markDirty();
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

    // ─── Tags ─────────────────────────────────────────────────────────────

    const handleUpdateTags = async (projectId: string, newTags: string[]) => {
        setUserProjects(prev => prev.map(p =>
            p.id === projectId ? { ...p, tags: newTags } : p
        ));
        try {
            const data = await mgr.quickStore.loadProject(projectId);
            if (data) {
                data.meta.tags = newTags;
                await mgr.quickStore.saveProject(data);
                mgr.syncEngine?.markDirty();
            }
            toast.success("Tags updated");
        } catch (error) {
            toast.error("Failed to update tags");
            refreshProjects();
        }
    };

    const handleCreateTag = async () => {
        if (!tagNameInput.trim()) return;
        const newTags: TagEntry[] = [...tags, { name: tagNameInput.trim(), color: tagColorInput }];
        try {
            const userId = user?.id;
            if (userId && mgr.supabaseMeta) {
                await mgr.supabaseMeta.saveUserTags(userId, newTags);
            }
            setTags(newTags);
            setTagNameInput("");
            toast.success(`Tag "${tagNameInput}" created`);
        } catch (error) {
            toast.error("Failed to create tag");
        }
    };

    const handleDeleteTag = async (tagName: string) => {
        setLoadingMessage(`Deleting tag ${tagName}...`);
        const newTags = tags.filter(t => t.name !== tagName);
        try {
            const userId = user?.id;
            if (userId && mgr.supabaseMeta) {
                await mgr.supabaseMeta.saveUserTags(userId, newTags);
            }
            setTags(newTags);

            // Remove tag from all projects that have it
            const projectsToUpdate = userProjects.filter(p => p.tags?.includes(tagName));
            for (const meta of projectsToUpdate) {
                const data = await mgr.quickStore.loadProject(meta.id);
                if (data) {
                    data.meta.tags = data.meta.tags.filter(t => t !== tagName);
                    await mgr.quickStore.saveProject(data);
                }
            }
            mgr.syncEngine?.markDirty();

            if (activeTags.includes(tagName)) {
                setActiveTags(prev => prev.filter(t => t !== tagName));
            }

            toast.success(`Tag "${tagName}" deleted`);
            await refreshProjects();
        } catch (error) {
            toast.error("Failed to delete tag");
        } finally {
            setLoadingMessage(null);
        }
    };

    // ─── Folders ──────────────────────────────────────────────────────────

    const handleAddFolder = () => {
        setFolderNameInput("");
        setFolderColorInput("#3b82f6");
        setShowFolderDialog(true);
    };

    const handleCreateFolder = async () => {
        if (!folderNameInput.trim()) return;
        const newFolders: FolderEntry[] = [...folders, { name: folderNameInput.trim(), color: folderColorInput }];
        try {
            const userId = user?.id;
            if (userId && mgr.supabaseMeta) {
                await mgr.supabaseMeta.saveUserFolders(userId, newFolders);
            }
            setFolders(newFolders);
            toast.success(`Folder "${folderNameInput}" created`);
            setShowFolderDialog(false);
        } catch (error) {
            toast.error("Failed to save folder");
        }
    };

    const handleRenameFolder = async () => {
        if (!renameFolderDialog || !renameFolderInput.trim()) return;
        const oldName = renameFolderDialog.name;
        const newName = renameFolderInput.trim();

        const newFolders = folders.map(f => f.name === oldName ? { ...f, name: newName } : f);

        setLoadingMessage(`Renaming folder...`);
        try {
            const userId = user?.id;
            if (userId && mgr.supabaseMeta) {
                await mgr.supabaseMeta.saveUserFolders(userId, newFolders);
            }
            setFolders(newFolders);

            // Update all projects in this folder
            const projectsInFolder = userProjects.filter(p => p.folder === oldName);
            for (const meta of projectsInFolder) {
                const data = await mgr.quickStore.loadProject(meta.id);
                if (data) {
                    data.meta.folder = newName;
                    await mgr.quickStore.saveProject(data);
                }
            }
            mgr.syncEngine?.markDirty();

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
            const newFolders = folders.filter(f => f.name !== folderName);
            const userId = user?.id;
            if (userId && mgr.supabaseMeta) {
                await mgr.supabaseMeta.saveUserFolders(userId, newFolders);
            }
            setFolders(newFolders);

            // Unassign projects
            const projectsInFolder = userProjects.filter(p => p.folder === folderName);
            for (const meta of projectsInFolder) {
                const data = await mgr.quickStore.loadProject(meta.id);
                if (data) {
                    data.meta.folder = '';
                    await mgr.quickStore.saveProject(data);
                }
            }
            mgr.syncEngine?.markDirty();

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
            const userId = user?.id;
            if (userId && mgr.supabaseMeta) {
                await mgr.supabaseMeta.saveUserFolders(userId, newFolders);
            }
            setFolders(newFolders);
        } catch (error) {
            toast.error("Failed to update folder color");
        }
    };

    const handleMoveProjectToFolder = async (projectId: string, folderName: string | undefined) => {
        try {
            const data = await mgr.quickStore.loadProject(projectId);
            if (data) {
                data.meta.folder = folderName || '';
                await mgr.quickStore.saveProject(data);
                mgr.syncEngine?.markDirty();
            }
            toast.success(folderName ? `Moved to ${folderName}` : `Removed from folder`);
            refreshProjects();
        } catch (error) {
            toast.error("Failed to move project");
        }
    };

    // ─── Reset Repository ─────────────────────────────────────────────────

    const handleResetRepository = async () => {
        setLoadingMessage("Purging Repository...");
        try {
            // resetAll() handles all storage layers:
            // - Suspends sync to prevent re-population
            // - Clears QuickStore (IndexedDB) completely via clearAll()
            //   (no tombstones written — this is a full wipe)
            // - Clears localStorage HiveCAD keys
            // - Deletes all data from GitHub (projects, extensions, settings)
            // - Deletes all user data from Supabase
            // - Does NOT resume sync after reset
            await mgr.resetAll((msg) => setLoadingMessage(msg));

            closeProject();

            // Clean up any remaining UI-specific localStorage
            localStorage.removeItem('hivecad_thumbnails');
            localStorage.removeItem('hivecad_example_opens');
            localStorage.removeItem('hivecad_thumbnails_cache');

            setStarredProjects([]);
            setFolders([]);
            setTags([]);
            setUserProjects([]);
            setExampleOpenedAt({});

            toast.success("Repository and local data reset successfully. Sync paused — reconnect GitHub to resume.");
            setShowResetConfirm(false);
        } catch (error) {
            console.error("Reset failed:", error);
            toast.error("Failed to reset repository.");
            await refreshProjects();
        } finally {
            setLoadingMessage(null);
        }
    };

    // ─── Star ─────────────────────────────────────────────────────────────

    const handleToggleStar = (e: React.MouseEvent, projectName: string) => {
        e.stopPropagation();
        setStarredProjects(prev =>
            prev.includes(projectName)
                ? prev.filter(p => p !== projectName)
                : [...prev, projectName]
        );
        toast.success(starredProjects.includes(projectName) ? `Removed from Starred` : `Added to Starred`);
    };

    const handleDashboardSync = async () => {
        if (!user?.pat) {
            setShowPATDialog(true);
            toast.error('GitHub is not connected yet.');
            return;
        }

        if (!mgr.syncEngine) {
            toast.error('Sync engine not available.');
            return;
        }

        try {
            setIsSyncingDashboard(true);
            toast.loading('Syncing with GitHub...', { id: 'dashboard-sync' });
            await mgr.syncEngine.syncNow();
            toast.success('Sync complete', { id: 'dashboard-sync' });
            await refreshProjects();
        } catch (error) {
            console.error('[ProjectDashboard] Sync failed:', error);
            toast.error('Sync failed', { id: 'dashboard-sync' });
        } finally {
            setIsSyncingDashboard(false);
        }
    };

    const handleShareProject = async (projectId: string) => {
        try {
            const data = await mgr.quickStore.loadProject(projectId);
            if (!data) {
                toast.error('Project not found');
                return;
            }

            const shareUrl = `${window.location.origin}/?project=${encodeURIComponent(projectId)}`;
            const wasPrivate = data.meta.visibility !== 'public';

            if (user?.id) {
                data.meta.ownerId = user.id;
            }
            if (user?.email) {
                data.meta.ownerEmail = user.email;
            }

            data.meta.visibility = 'public';
            data.meta.remoteLocator = shareUrl;
            data.meta.lastModified = Date.now();

            await mgr.quickStore.saveProject(data);
            mgr.syncEngine?.markDirty();

            let supabaseSyncBlocked = false;
            if (mgr.supabaseMeta && user?.id) {
                try {
                    await mgr.supabaseMeta.upsertProjectMeta(data.meta);
                    await mgr.supabaseMeta.setProjectVisibility(projectId, 'public');
                } catch (error: any) {
                    const code = error?.code;
                    if (code === '42501') {
                        supabaseSyncBlocked = true;
                        console.warn('[ProjectDashboard] Supabase RLS blocked share metadata sync. Falling back to local/GitHub sync.', error);
                    } else {
                        throw error;
                    }
                }
            }

            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                await navigator.clipboard.writeText(shareUrl);
                if (supabaseSyncBlocked) {
                    toast.success(wasPrivate
                        ? 'Project marked public locally and link copied. Supabase policy blocked immediate publish metadata.'
                        : 'Share link copied. Supabase policy blocked immediate publish metadata.');
                } else {
                    toast.success(wasPrivate ? 'Project is now public. Link copied.' : 'Share link copied.');
                }
            } else {
                toast.success('Project is public. Copy this link from the browser URL bar.');
            }

            await refreshProjects();
        } catch (error) {
            console.error('[ProjectDashboard] Share failed:', error);
            toast.error('Failed to share project');
        }
    };

    // ─── Navigation ───────────────────────────────────────────────────────

    const navItems = [
        { icon: Clock, label: 'Last Opened' },
        { icon: User, label: 'Created by me' },
        { icon: Star, label: 'Starred' },
        { icon: Users, label: 'Shared with me' },
        { icon: Globe, label: 'Public by me' },
        { icon: Trash2, label: 'Trash' },
    ];

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans flex-col">
            {/* Main Header */}
            <header className="h-16 border-b border-border/40 flex items-center justify-between px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0 z-50">
                <div className="flex items-center gap-3 w-64">
                    <img src="/favicon.ico" alt="HiveCAD Logo" className="w-9 h-9 rounded-xl shadow-sm" />
                    <span className="font-bold text-foreground text-xl tracking-tight">HiveCAD</span>
                </div>
                <div className="flex-1 flex justify-center">
                    <div className="relative grid grid-cols-2 bg-muted/50 p-1.5 rounded-full border border-border/50 backdrop-blur-sm min-w-[380px]">
                        <div
                            className={cn(
                                "absolute top-1.5 bottom-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-full bg-background shadow-sm transition-transform duration-300 ease-out",
                                dashboardMode === 'workspace' ? "translate-x-0" : "translate-x-full"
                            )}
                        />
                        <button
                            onClick={() => setDashboardMode('workspace')}
                            className={`relative z-10 w-full px-6 py-2 text-sm font-bold rounded-full transition-colors duration-300 ${dashboardMode === 'workspace' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            MY WORKSPACE
                        </button>
                        <button
                            onClick={() => setDashboardMode('discover')}
                            className={`relative z-10 w-full px-6 py-2 text-sm font-bold rounded-full transition-colors duration-300 ${dashboardMode === 'discover' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            DISCOVER
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-muted-foreground w-64 justify-end">
                    <div className="flex items-center gap-3 relative">
                        <button
                            onClick={handleDashboardSync}
                            className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                            title={!user?.pat ? 'GitHub Sync Disabled - Click to link' : 'Sync with GitHub'}
                        >
                            <RefreshCw className={`w-5 h-5 ${isSyncingDashboard ? 'animate-spin' : ''}`} />
                        </button>

                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
                            title="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>

                        <SettingsDialog
                            open={isSettingsOpen}
                            onOpenChange={setIsSettingsOpen}
                        />
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
                                                    {userProjects.filter(p => p.folder === folder.name).length} projects
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
                                            setSelectedFolder(null);
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all border ${activeNav === item.label && activeTags.length === 0 && !selectedFolder
                                            ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]'
                                            : 'bg-secondary/55 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                                            }`}
                                    >
                                        <item.icon className="w-3.5 h-3.5" />
                                        {item.label.toUpperCase()}
                                    </button>
                                ))}
                                <div className="w-px h-6 bg-border/70 mx-2" />
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
                                            .map(e => ({ ...e, type: 'example' as const, ownerId: 'Example Project', tags: [] as string[], folder: '', lastModified: Date.parse(e.modified) }))
                                    ]
                                        .filter(p => (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
                                        .filter(p => {
                                            // Folder Filter
                                            if (selectedFolder) {
                                                if ((p as any).folder !== selectedFolder) return false;
                                            }

                                            // Tag filter
                                            const projectTags = (p as any).tags || [];
                                            if (activeTags.length > 0) {
                                                return activeTags.every(t => projectTags.includes(t));
                                            }
                                            const isStarred = starredProjects.includes(p.name);
                                            if (activeNav === 'Starred') return isStarred;
                                            if (activeNav === 'Created by me') return p.type === 'user' || (p as any).ownerId === 'Example Project';
                                            if (activeNav === 'Shared with me') return false;
                                            if (activeNav === 'Public by me') return p.type === 'user' && (p as any).visibility === 'public';
                                            if (activeNav === 'Last Opened') return true;
                                            if (activeNav === 'Tags') return projectTags.length > 0;
                                            if (activeNav === 'Trash') return false;
                                            return true;
                                        })
                                        .sort((a: any, b: any) => {
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
                                                    setTagNameInput("");
                                                }}
                                                onShare={() => handleShareProject(project.id)}
                                                onViewHistory={() => setShowHistoryDialog(project.id)}
                                                tags={tags}
                                                projectThumbnails={projectThumbnails}
                                                hasPAT={!!user?.pat}
                                                folders={folders}
                                                onMoveToFolder={(folderName: string) => handleMoveProjectToFolder(project.id, folderName)}
                                            />
                                        ))}
                                    {userProjects.length === 0 && EXAMPLES.length === 0 && (
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
                                                    {(item.ownerEmail || '?')[0]}
                                                </div>
                                                <span className="text-[10px] text-zinc-500 font-medium">@{item.ownerEmail}</span>
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
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleCreateFolder();
                                        if (e.key === 'Escape') setShowFolderDialog(false);
                                    }}
                                    autoFocus
                                    placeholder="e.g. Mechanical Parts"
                                    className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/30"
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
                    <div className="bg-popover border border-border rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
                        <h4 className="text-xl font-bold text-foreground mb-4">Rename Project</h4>
                        <input
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameProject(showRenameDialog.id, renameInput);
                                if (e.key === 'Escape') setShowRenameDialog(null);
                            }}
                            autoFocus
                            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-6"
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
                        <h4 className="text-xl font-bold text-foreground mb-1">Manage Tags</h4>
                        <p className="text-muted-foreground text-xs mb-6 font-medium uppercase tracking-widest">For: {showTagDialog.name}</p>

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
                                            className="w-full bg-input border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none placeholder:text-muted-foreground/50"
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
                                                        ? 'bg-primary/10 border-primary text-foreground shadow-[0_0_15px_rgba(var(--primary),0.1)]'
                                                        : 'bg-muted/30 border-border text-muted-foreground hover:border-muted-foreground/50'
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
                                    You are about to <span className="text-destructive font-bold underline">delete your entire HiveCAD repository</span>.
                                    This will permanently erase all projects, tags, and settings history. This action cannot be undone.
                                </p>
                            </div>

                            <div className="w-full bg-destructive/5 border border-destructive/10 rounded-lg p-4 text-left">
                                <ul className="text-[10px] text-destructive/80 font-black uppercase tracking-widest space-y-2">
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-destructive rounded-full" /> All project files will be deleted</li>
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-destructive rounded-full" /> Local cache will be wiped</li>
                                    <li className="flex items-center gap-2"><div className="w-1 h-1 bg-destructive rounded-full" /> Remote storage will be reset</li>
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

            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
                    <div className="bg-card border-2 border-destructive/30 rounded-2xl p-8 w-full max-w-lg shadow-[0_0_50px_rgba(239,68,68,0.2)] animate-in fade-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center text-destructive">
                                <Trash2 className="w-8 h-8" />
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-2xl font-black text-foreground uppercase tracking-tighter">Proper Delete</h4>
                                <p className="text-muted-foreground text-sm leading-relaxed">
                                    You are about to permanently delete <strong>{showDeleteConfirm.name}</strong>.
                                    This will remove the project from all storage layers.
                                    <span className="block mt-2 text-destructive/80 font-bold uppercase text-[10px] tracking-widest">This action is irreversible.</span>
                                </p>
                            </div>

                            <div className="flex gap-4 w-full pt-4">
                                <Button
                                    variant="ghost"
                                    className="flex-1 h-12 border border-border text-muted-foreground hover:text-foreground hover:bg-zinc-800 rounded-xl"
                                    onClick={() => {
                                        setShowDeleteConfirm(null);
                                    }}
                                >
                                    ABORT
                                </Button>
                                <Button
                                    className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white font-black shadow-lg rounded-xl"
                                    onClick={handleConfirmDelete}
                                >
                                    YES, DELETE PERMANENTLY
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
                        handleOpenProject(project);
                    }
                }}
            />
        </div>
    );
}

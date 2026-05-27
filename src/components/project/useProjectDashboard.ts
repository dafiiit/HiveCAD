/**
 * useProjectDashboard
 *
 * Centralises all state and async handlers for the ProjectDashboard component.
 * Separating them here keeps the component file focused on rendering and lets
 * the logic be tested in isolation without mounting a React tree.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useCADStore } from '@/hooks/useCADStore';
import { useGlobalStore } from '@/store/useGlobalStore';
import { useTabManager } from '@/components/layout/TabContext';
import { toast } from 'sonner';
import type { ProjectMeta, ProjectData, TagEntry, FolderEntry } from '@/lib/storage/types';
import { createBlank3DModel, uuid } from '@/lib/storage/projectUtils';
import { StorageManager } from '@/lib/storage/StorageManager';
import { EXAMPLES } from '@/lib/data/examples';
import { clearStarredProjects, loadStarredProjects, saveStarredProjects, toggleStarredProject } from './starredProjects';

type DashboardMode = 'workspace' | 'discover';
const FOLDERS_STORAGE_KEY = 'hivecad_folders';
const LAST_OPENED_STORAGE_KEY = 'hivecad_last_opened';

type WorkspaceProject = ProjectMeta & {
    type?: 'user' | 'example';
    tags?: string[];
};

export const matchesWorkspaceProjectFilters = (
    project: WorkspaceProject,
    {
        activeNav,
        activeTags,
        searchQuery,
        starredProjects,
        currentUserId,
    }: {
        activeNav: string;
        activeTags: string[];
        searchQuery: string;
        starredProjects: string[];
        currentUserId?: string | null;
    },
) => {
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSearch = project.name.toLowerCase().includes(q) || project.description?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
    }

    if (activeTags.length > 0) {
        const projectTags = project.tags || [];
        if (!activeTags.every(tag => projectTags.includes(tag))) {
            return false;
        }
    }

    const isStarred = starredProjects.includes(project.id);
    if (activeNav === 'Starred') return isStarred;
    if (activeNav === 'Created by me') return project.type === 'user' && project.ownerId === currentUserId;
    if (activeNav === 'Shared with me') return project.type === 'user' && project.ownerId !== currentUserId;
    if (activeNav === 'Public by me') return project.type === 'user' && project.visibility === 'public' && project.ownerId === currentUserId;
    if (activeNav === 'Last Opened') return true;
    if (activeNav === 'Tags') return (project.tags || []).length > 0;
    return true;
};

export const sortWorkspaceProjects = (
    projects: WorkspaceProject[],
    activeNav: string,
    lastOpenedAt: Record<string, number> = {},
) => {
    return [...projects].sort((a, b) => {
        const aSort = activeNav === 'Last Opened'
            ? (lastOpenedAt[a.id] ?? a.lastModified ?? 0)
            : (a.lastModified ?? 0);
        const bSort = activeNav === 'Last Opened'
            ? (lastOpenedAt[b.id] ?? b.lastModified ?? 0)
            : (b.lastModified ?? 0);
        return bSort - aSort;
    });
};

export function useProjectDashboard() {
    const { openProjectInNewTab } = useTabManager();
    const { user, logout, showPATDialog, setShowPATDialog, isStorageConnected } = useGlobalStore();
    const { setFileName, setCode, projectThumbnails, reset, closeProject, removeThumbnail } = useCADStore();

    // ─── UI State ────────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [dashboardMode, setDashboardMode] = useState<DashboardMode>('workspace');
    const [activeNav, setActiveNav] = useState('Last Opened');
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [isSyncingDashboard, setIsSyncingDashboard] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // ─── Data State ───────────────────────────────────────────────────────────
    const [userProjects, setUserProjects] = useState<ProjectMeta[]>([]);
    const [discoverProjects, setDiscoverProjects] = useState<ProjectMeta[]>([]);
    const [folders, setFolders] = useState<FolderEntry[]>([]);
    const [tags, setTags] = useState<TagEntry[]>([]);
    const [activeTags, setActiveTags] = useState<string[]>([]);
    const [starredProjects, setStarredProjects] = useState<string[]>(() => loadStarredProjects());
    const [lastOpenedAt, setLastOpenedAt] = useState<Record<string, number>>(() => {
        try { return JSON.parse(localStorage.getItem(LAST_OPENED_STORAGE_KEY) || '{}'); }
        catch { return {}; }
    });

    // ─── Dialog State ─────────────────────────────────────────────────────────
    const [contextMenuProject, setContextMenuProject] = useState<string | null>(null);
    const [showRenameDialog, setShowRenameDialog] = useState<ProjectMeta | null>(null);
    const [renameInput, setRenameInput] = useState('');
    const [showTagDialog, setShowTagDialog] = useState<ProjectMeta | null>(null);
    const [tagNameInput, setTagNameInput] = useState('');
    const [tagColorInput, setTagColorInput] = useState('#fbbf24');
    const [showFolderDialog, setShowFolderDialog] = useState(false);
    const [folderNameInput, setFolderNameInput] = useState('');
    const [folderColorInput, setFolderColorInput] = useState('#3b82f6');
    const [folderDescriptionInput, setFolderDescriptionInput] = useState('');
    const [selectedProject, setSelectedProject] = useState<FolderEntry | null>(null);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [folderParentId, setFolderParentId] = useState<string | undefined>(undefined);
    const [contextMenuFolder, setContextMenuFolder] = useState<string | null>(null);
    const [renameFolderDialog, setRenameFolderDialog] = useState<FolderEntry | null>(null);
    const [renameFolderInput, setRenameFolderInput] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<ProjectMeta | null>(null);
    const [deleteInput, setDeleteInput] = useState('');
    const [showHistoryDialog, setShowHistoryDialog] = useState<string | null>(null);

    const [exampleOpenedAt, setExampleOpenedAt] = useState<Record<string, number>>(() => {
        try { return JSON.parse(localStorage.getItem('hivecad_example_opens') || '{}'); }
        catch { return {}; }
    });

    const autoOpenHandledRef = useRef(false);
    const mgr = StorageManager.getInstance();

    const markProjectOpened = useCallback((projectId: string) => {
        setLastOpenedAt(prev => ({
            ...prev,
            [projectId]: Date.now(),
        }));
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(LAST_OPENED_STORAGE_KEY, JSON.stringify(lastOpenedAt));
        } catch (e) {
            console.warn('[Dashboard] Failed to save last opened timestamps', e);
        }
    }, [lastOpenedAt]);

    // ─── Folder Persistence ───────────────────────────────────────────────────

    const persistFolders = useCallback(async (newFolders: FolderEntry[]) => {
        try { localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(newFolders)); }
        catch (e) { console.warn('[Folders] Failed to save to localStorage', e); }
        const userId = user?.id;
        if (userId && mgr.supabaseMeta) {
            try { await mgr.supabaseMeta.saveUserFolders(userId, newFolders); }
            catch (e) { console.warn('[Folders] Failed to save to Supabase', e); }
        }
        setFolders(newFolders);
    }, [user?.id, mgr.supabaseMeta]);

    const loadFolders = useCallback(async (): Promise<FolderEntry[]> => {
        const userId = user?.id;
        if (userId && mgr.supabaseMeta) {
            try {
                const remote = await mgr.supabaseMeta.getUserFolders(userId);
                if (remote.length > 0) {
                    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(remote));
                    return remote;
                }
            } catch (e) { console.warn('[Folders] Failed to load from Supabase', e); }
        }
        try {
            const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { console.warn('[Folders] Failed to load from localStorage', e); }
        return [];
    }, [user?.id, mgr.supabaseMeta]);

    // ─── Refresh Projects ─────────────────────────────────────────────────────

    const refreshWorkspaceProjects = useCallback(async () => {
        if (dashboardMode === 'workspace') {
            setLoading(true);
            try {
                const metas = await mgr.quickStore.listProjects();
                setUserProjects(metas.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0)));
                const userId = user?.id;
                if (userId && mgr.supabaseMeta) {
                    try {
                        const fetchedTags = await mgr.supabaseMeta.getUserTags(userId);
                        setTags(fetchedTags);
                    } catch (e) { console.warn('Failed to fetch tags', e); }
                }
                const fetchedFolders = await loadFolders();
                setFolders(fetchedFolders);
            } catch (error) {
                console.error('Failed to fetch projects:', error);
            } finally {
                setLoading(false);
            }
        }
    }, [user?.pat, user?.id, loadFolders, mgr.quickStore, mgr.supabaseMeta, dashboardMode]);

    const refreshDiscoverProjects = useCallback(async () => {
        if (dashboardMode === 'discover') {
            setLoading(true);
            try {
                if (mgr.supabaseMeta) {
                    // Discover mode does not expose a search box yet, so keep the
                    // public feed stable instead of leaking the workspace query into it.
                    const projects = await mgr.supabaseMeta.searchPublicProjects('');
                    setDiscoverProjects(projects);
                }
            } catch (error) {
                console.error('Failed to fetch discover projects:', error);
                setDiscoverProjects([]);
            } finally {
                setLoading(false);
            }
        }
    }, [dashboardMode, mgr.supabaseMeta]);

    const refreshProjects = useCallback(async () => {
        if (dashboardMode === 'workspace') {
            await refreshWorkspaceProjects();
        } else {
            await refreshDiscoverProjects();
        }
    }, [dashboardMode, refreshDiscoverProjects, refreshWorkspaceProjects]);

    useEffect(() => {
        if (dashboardMode === 'workspace') {
            void refreshWorkspaceProjects();
        }
    }, [dashboardMode, refreshWorkspaceProjects]);

    useEffect(() => {
        if (dashboardMode === 'discover') {
            void refreshDiscoverProjects();
        }
    }, [dashboardMode, refreshDiscoverProjects]);

    useEffect(() => {
        saveStarredProjects(starredProjects);
    }, [starredProjects]);

    // ─── Auto-open shared project from URL param ───────────────────────────────

    useEffect(() => {
        if (autoOpenHandledRef.current) return;
        const params = new URLSearchParams(window.location.search);
        const projectId = params.get('project');
        if (!projectId) { autoOpenHandledRef.current = true; return; }
        if (user?.pat && !isStorageConnected) return;

        const clearProjectQueryParam = () => {
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.delete('project');
            const nextQuery = nextUrl.searchParams.toString();
            window.history.replaceState({}, '', `${nextUrl.pathname}${nextQuery ? `?${nextQuery}` : ''}${nextUrl.hash}`);
        };

        autoOpenHandledRef.current = true;
        let cancelled = false;

        const openSharedProject = async () => {
            setLoadingMessage('Opening shared project...');
            try {
                let data = await mgr.quickStore.loadProject(projectId);
                if (!data && mgr.isRemoteConnected) {
                    data = await mgr.remoteStore!.pullProject(projectId);
                    if (data) await mgr.quickStore.saveProject(data);
                }
                if (cancelled) return;
                if (data) {
                    markProjectOpened(data.meta.id);
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
                if (!cancelled) { setLoadingMessage(null); clearProjectQueryParam(); }
            }
        };

        void openSharedProject();
        return () => { cancelled = true; };
    }, [user?.pat, isStorageConnected, openProjectInNewTab, refreshProjects]);

    // ─── Project CRUD ─────────────────────────────────────────────────────────

    const handleCreate3DModel = async (targetFolder?: string) => {
        const existingNames = userProjects.map(p => p.name);
        let name = 'Unnamed';
        let counter = 1;
        while (existingNames.includes(name)) { counter++; name = `Unnamed ${counter}`; }

        const projectId = uuid();
        const newProject = createBlank3DModel({
            id: projectId,
            name,
            ownerId: user?.id || 'anon',
            ownerEmail: user?.email || '',
            folder: targetFolder || '',
        });

        try {
            await mgr.quickStore.saveProject(newProject);
            mgr.syncEngine?.markDirty();
        } catch (e) { console.error('Failed to save new 3D model', e); }

        const DEFAULT_THUMBNAIL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        try {
            const currentThumbnails = JSON.parse(localStorage.getItem('hivecad_thumbnails') || '{}');
            currentThumbnails[projectId] = DEFAULT_THUMBNAIL;
            currentThumbnails[name] = DEFAULT_THUMBNAIL;
            localStorage.setItem('hivecad_thumbnails', JSON.stringify(currentThumbnails));
        } catch (e) { console.warn('Failed to set default thumbnail', e); }

        markProjectOpened(newProject.meta.id);
        openProjectInNewTab(newProject);
        toast.success(`Started new 3D model: ${name}`);
        refreshProjects();
    };

    const handleOpenProject = async (meta: ProjectMeta) => {
        setLoadingMessage(`Loading ${meta.name}...`);
        try {
            let data: ProjectData | null = await mgr.quickStore.loadProject(meta.id);
            if (!data && mgr.isRemoteConnected) {
                data = await mgr.remoteStore!.pullProject(meta.id);
                if (data) await mgr.quickStore.saveProject(data);
            }
            if (data) {
                markProjectOpened(data.meta.id);
                openProjectInNewTab(data);
                toast.success(`Opened project: ${data.meta.name}`);
                refreshProjects();
            } else {
                toast.error('Project data not found');
            }
        } catch (error) {
            console.error('Failed to open project:', error);
            toast.error('Failed to open project');
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleForkProject = async (meta: ProjectMeta) => {
        setLoadingMessage(`Forking ${meta.name}...`);
        try {
            let sourceData: ProjectData | null = null;
            if (mgr.isRemoteConnected) sourceData = await mgr.remoteStore!.pullProject(meta.id);
            if (!sourceData) throw new Error('Failed to load source project');

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
            markProjectOpened(forkId);
            toast.success(`Forked "${meta.name}" to your workspace!`);
            setDashboardMode('workspace');
            refreshProjects();
        } catch (error) {
            console.error('Fork failed:', error);
            toast.error('Failed to fork project');
        } finally {
            setLoadingMessage(null);
        }
    };

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

        markProjectOpened(projectData.meta.id);
        openProjectInNewTab(projectData);
        toast.success(`Opened ${example.name}`);
    };

    const handleDeleteProject = (projectId: string) => {
        const project = userProjects.find(p => p.id === projectId);
        if (project) {
            setShowDeleteConfirm(project);
            setDeleteInput('');
        }
    };

    const handleConfirmDelete = async () => {
        if (!showDeleteConfirm) return;
        const { id: projectId, name: projectName } = showDeleteConfirm;
        setUserProjects(prev => prev.filter(p => p.id !== projectId));
        setShowDeleteConfirm(null);
        toast.success(`Deleting "${projectName}"...`);

        try {
            await mgr.quickStore.deleteProject(projectId);
            if (mgr.isRemoteConnected) {
                try { await mgr.remoteStore!.deleteProject(projectId); }
                catch (err) { console.warn(`[Dashboard] Failed to delete ${projectId} from remote:`, err); }
            }
            try { await mgr.supabaseMeta?.deleteProjectMeta(projectId); }
            catch (err) { console.warn(`[Dashboard] Failed to delete ${projectId} from Supabase:`, err); }
            removeThumbnail(projectName);
            setStarredProjects(prev => prev.filter(id => id !== projectId));
            toast.success(`Deleted "${projectName}"`);
            await refreshProjects();
        } catch (error) {
            console.error('Delete failed:', error);
            toast.error(`Failed to delete "${projectName}"`);
            await refreshProjects();
        }
    };

    const handleRenameProject = async (projectId: string, newName: string) => {
        if (!newName.trim()) return;
        setLoadingMessage(`Renaming to ${newName}...`);
        try {
            const data = await mgr.quickStore.loadProject(projectId);
            if (data) {
                data.meta.name = newName.trim();
                data.meta.lastModified = Date.now();
                await mgr.quickStore.saveProject(data);
                mgr.syncEngine?.markDirty();
            }
            toast.success('Project renamed successfully');
            setShowRenameDialog(null);
            setRenameInput('');
            await refreshProjects();
        } catch (error) {
            console.error('Rename failed:', error);
            toast.error('Failed to rename project');
        } finally {
            setLoadingMessage(null);
        }
    };

    // ─── Tags ─────────────────────────────────────────────────────────────────

    const handleUpdateTags = async (projectId: string, newTags: string[]) => {
        setUserProjects(prev => prev.map(p => p.id === projectId ? { ...p, tags: newTags } : p));
        try {
            const data = await mgr.quickStore.loadProject(projectId);
            if (data) {
                data.meta.tags = newTags;
                await mgr.quickStore.saveProject(data);
                mgr.syncEngine?.markDirty();
            }
            toast.success('Tags updated');
        } catch (error) {
            toast.error('Failed to update tags');
            refreshProjects();
        }
    };

    const handleCreateTag = async () => {
        if (!tagNameInput.trim()) return;
        const newTags: TagEntry[] = [...tags, { name: tagNameInput.trim(), color: tagColorInput }];
        try {
            const userId = user?.id;
            if (userId && mgr.supabaseMeta) await mgr.supabaseMeta.saveUserTags(userId, newTags);
            setTags(newTags);
            setTagNameInput('');
            toast.success(`Tag "${tagNameInput}" created`);
        } catch (error) {
            toast.error('Failed to create tag');
        }
    };

    const handleDeleteTag = async (tagName: string) => {
        setLoadingMessage(`Deleting tag ${tagName}...`);
        const newTags = tags.filter(t => t.name !== tagName);
        try {
            const userId = user?.id;
            if (userId && mgr.supabaseMeta) await mgr.supabaseMeta.saveUserTags(userId, newTags);
            setTags(newTags);
            const projectsToUpdate = userProjects.filter(p => p.tags?.includes(tagName));
            for (const meta of projectsToUpdate) {
                const data = await mgr.quickStore.loadProject(meta.id);
                if (data) {
                    data.meta.tags = data.meta.tags.filter(t => t !== tagName);
                    await mgr.quickStore.saveProject(data);
                }
            }
            mgr.syncEngine?.markDirty();
            if (activeTags.includes(tagName)) setActiveTags(prev => prev.filter(t => t !== tagName));
            toast.success(`Tag "${tagName}" deleted`);
            await refreshProjects();
        } catch (error) {
            toast.error('Failed to delete tag');
        } finally {
            setLoadingMessage(null);
        }
    };

    // ─── Folders ──────────────────────────────────────────────────────────────

    const handleAddFolder = () => {
        setFolderParentId(undefined);
        setFolderNameInput('');
        setFolderColorInput('#3b82f6');
        setFolderDescriptionInput('');
        setShowFolderDialog(true);
    };

    const handleCreateFolder = async (parentId?: string) => {
        if (!folderNameInput.trim()) return;
        const newFolder: FolderEntry = {
            id: uuid(),
            name: folderNameInput.trim(),
            color: folderColorInput,
            description: folderDescriptionInput.trim() || undefined,
            parentId: parentId || undefined,
        };
        try {
            await persistFolders([...folders, newFolder]);
            toast.success(`Project "${folderNameInput}" created`);
            setShowFolderDialog(false);
        } catch (error) {
            toast.error('Failed to create project');
        }
    };

    const handleRenameFolder = async () => {
        if (!renameFolderDialog || !renameFolderInput.trim()) return;
        const newName = renameFolderInput.trim();
        const newFolders = folders.map(f => f.id === renameFolderDialog.id ? { ...f, name: newName } : f);
        setLoadingMessage('Renaming project...');
        try {
            await persistFolders(newFolders);
            if (selectedProject?.id === renameFolderDialog.id) setSelectedProject({ ...selectedProject, name: newName });
            toast.success('Project renamed');
            setRenameFolderDialog(null);
            await refreshProjects();
        } catch (error) {
            toast.error('Failed to rename project');
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleDeleteFolder = async (folderId: string) => {
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return;
        const confirmed = window.confirm(`Are you sure you want to delete project "${folder.name}"? 3D models inside will be moved to root.`);
        if (!confirmed) return;

        setLoadingMessage('Deleting project...');
        try {
            const idsToRemove = new Set<string>();
            const collectChildren = (parentId: string) => {
                idsToRemove.add(parentId);
                folders.filter(f => f.parentId === parentId).forEach(f => collectChildren(f.id));
            };
            collectChildren(folderId);

            await persistFolders(folders.filter(f => !idsToRemove.has(f.id)));
            const modelsInDeleted = userProjects.filter(p => idsToRemove.has(p.folder));
            for (const meta of modelsInDeleted) {
                const data = await mgr.quickStore.loadProject(meta.id);
                if (data) { data.meta.folder = ''; await mgr.quickStore.saveProject(data); }
            }
            mgr.syncEngine?.markDirty();
            if (selectedProject && idsToRemove.has(selectedProject.id)) {
                setSelectedProject(null);
                setSelectedFolder(null);
            }
            toast.success('Project deleted');
            await refreshProjects();
        } catch (error) {
            toast.error('Failed to delete project');
        } finally {
            setLoadingMessage(null);
        }
    };

    const handleFolderColorChange = async (folderId: string, newColor: string) => {
        try {
            await persistFolders(folders.map(f => f.id === folderId ? { ...f, color: newColor } : f));
        } catch (error) {
            toast.error('Failed to update folder color');
        }
    };

    const handleMoveProjectToFolder = async (projectId: string, folderId: string | undefined) => {
        try {
            const data = await mgr.quickStore.loadProject(projectId);
            if (data) {
                data.meta.folder = folderId || '';
                await mgr.quickStore.saveProject(data);
                mgr.syncEngine?.markDirty();
            }
            const folderName = folderId ? folders.find(f => f.id === folderId)?.name : undefined;
            toast.success(folderName ? `Moved to ${folderName}` : 'Removed from project');
            refreshProjects();
        } catch (error) {
            toast.error('Failed to move project');
        }
    };

    // ─── Repository Reset ─────────────────────────────────────────────────────

    const handleResetRepository = async () => {
        setLoadingMessage('Purging Repository...');
        try {
            await mgr.resetAll((msg) => setLoadingMessage(msg));
            closeProject();
            localStorage.removeItem('hivecad_thumbnails');
            localStorage.removeItem('hivecad_example_opens');
            localStorage.removeItem('hivecad_thumbnails_cache');
            localStorage.removeItem(LAST_OPENED_STORAGE_KEY);
            clearStarredProjects();
            setStarredProjects([]);
            setFolders([]);
            setTags([]);
            setUserProjects([]);
            setExampleOpenedAt({});
            setLastOpenedAt({});
            toast.success('Repository and local data reset successfully. Sync paused — reconnect GitHub to resume.');
            setShowResetConfirm(false);
        } catch (error) {
            console.error('Reset failed:', error);
            toast.error('Failed to reset repository.');
            await refreshProjects();
        } finally {
            setLoadingMessage(null);
        }
    };

    // ─── Misc ─────────────────────────────────────────────────────────────────

    const handleToggleStar = (e: React.MouseEvent, projectId: string) => {
        e.stopPropagation();
        const isAdded = !starredProjects.includes(projectId);
        setStarredProjects(prev => toggleStarredProject(prev, projectId));
        toast.success(isAdded ? 'Added to Starred' : 'Removed from Starred');
    };

    const handleDashboardSync = async () => {
        if (!user?.pat) { setShowPATDialog(true); toast.error('GitHub is not connected yet.'); return; }
        if (!mgr.syncEngine) { toast.error('Sync engine not available.'); return; }
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
            if (!data) { toast.error('Project not found'); return; }

            const shareUrl = `${window.location.origin}/?project=${encodeURIComponent(projectId)}`;
            const wasPrivate = data.meta.visibility !== 'public';

            if (user?.id) data.meta.ownerId = user.id;
            if (user?.email) data.meta.ownerEmail = user.email;
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
                    if (error?.code === '42501') {
                        supabaseSyncBlocked = true;
                        console.warn('[Dashboard] Supabase RLS blocked share metadata sync.', error);
                    } else { throw error; }
                }
            }

            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                await navigator.clipboard.writeText(shareUrl);
                toast.success(supabaseSyncBlocked
                    ? (wasPrivate ? 'Project marked public locally and link copied. Supabase policy blocked immediate publish metadata.' : 'Share link copied. Supabase policy blocked immediate publish metadata.')
                    : (wasPrivate ? 'Project is now public. Link copied.' : 'Share link copied.')
                );
            } else {
                toast.success('Project is public. Copy this link from the browser URL bar.');
            }

            await refreshProjects();
        } catch (error) {
            console.error('[ProjectDashboard] Share failed:', error);
            toast.error('Failed to share project');
        }
    };

    // ─── Computed/Derived Values ───────────────────────────────────────────────

    /** Filter the project list according to active nav, star, tags, folder, and search. */
    const getFilteredProjects = () => {
        return userProjects
            .filter(p => selectedFolder ? p.folder === selectedFolder : true)
            .filter(p => matchesWorkspaceProjectFilters(p, {
                activeNav,
                activeTags,
                searchQuery,
                starredProjects,
                currentUserId: user?.id,
            }));
    };

    return {
        // State
        searchQuery, setSearchQuery,
        viewMode, setViewMode,
        dashboardMode, setDashboardMode,
        activeNav, setActiveNav,
        loading, loadingMessage,
        isSyncingDashboard,
        isSettingsOpen, setIsSettingsOpen,
        showSettingsMenu, setShowSettingsMenu,
        showResetConfirm, setShowResetConfirm,
        userProjects,
        discoverProjects,
        folders,
        tags, activeTags, setActiveTags,
        starredProjects,
        contextMenuProject, setContextMenuProject,
        showRenameDialog, setShowRenameDialog,
        renameInput, setRenameInput,
        showTagDialog, setShowTagDialog,
        tagNameInput, setTagNameInput,
        tagColorInput, setTagColorInput,
        showFolderDialog, setShowFolderDialog,
        folderNameInput, setFolderNameInput,
        folderColorInput, setFolderColorInput,
        folderDescriptionInput, setFolderDescriptionInput,
        selectedProject, setSelectedProject,
        selectedFolder, setSelectedFolder,
        folderParentId, setFolderParentId,
        contextMenuFolder, setContextMenuFolder,
        renameFolderDialog, setRenameFolderDialog,
        renameFolderInput, setRenameFolderInput,
        showDeleteConfirm, setShowDeleteConfirm,
        deleteInput, setDeleteInput,
        showHistoryDialog, setShowHistoryDialog,
        exampleOpenedAt,
        lastOpenedAt,
        // Store values
        user, logout, showPATDialog, setShowPATDialog, projectThumbnails,
        // Handlers
        refreshProjects,
        handleCreate3DModel,
        handleOpenProject,
        handleForkProject,
        handleOpenExample,
        handleDeleteProject,
        handleConfirmDelete,
        handleRenameProject,
        handleUpdateTags,
        handleCreateTag,
        handleDeleteTag,
        handleAddFolder,
        handleCreateFolder,
        handleRenameFolder,
        handleDeleteFolder,
        handleFolderColorChange,
        handleMoveProjectToFolder,
        handleResetRepository,
        handleToggleStar,
        handleDashboardSync,
        handleShareProject,
        getFilteredProjects,
    };
}

import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { CADState, VersioningSlice, Comment, HistoryItem } from '../types';
import {
    serializeObjects, cleanObjects, createBlankProject, uuid, DEFAULT_CODE,
} from '@/lib/storage/projectUtils';
import { StorageManager } from '@/lib/storage/StorageManager';
import { ID } from '@/lib/utils/id-generator';
import type { ProjectData, CommitInfo } from '@/lib/storage/types';
import { buildHydratedPatch, type CADStateFixture } from '../hydration';

const generateId = () => ID.generatePrefixed('hist');

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Build a ProjectData from the current store state.
 */
function buildProjectData(state: CADState): ProjectData {
    const mgr = StorageManager.getInstance();
    return {
        meta: {
            id: state.projectId ?? uuid(),
            name: state.fileName,
            ownerId: '',
            ownerEmail: '',
            description: '',
            visibility: 'private',
            tags: [],
            folder: '',
            thumbnail: state.projectThumbnails[state.fileName] ?? '',
            lastModified: Date.now(),
            createdAt: Date.now(),
            remoteProvider: mgr.remoteStore?.providerKey ?? 'github',
            remoteLocator: '',
            lockedBy: null,
        },
        snapshot: {
            code: state.code,
            objects: serializeObjects(state.objects),
            sketches: state.getSerializedSketches(),
        },
        namespaces: {},
    };
}

export const createVersioningSlice: StateCreator<
    CADState,
    [],
    [],
    VersioningSlice
> = (set, get) => ({
    // ─── Transient History (Undo/Redo) ──────────────────────────────────────
    history: [
        {
            id: 'initial',
            type: 'initial',
            name: 'Initial State',
            timestamp: Date.now(),
            objects: [],
            code: DEFAULT_CODE,
            selectedIds: [],
        },
    ],
    historyIndex: 0,

    // ─── Project Info ───────────────────────────────────────────────────────
    fileName: 'Untitled',
    projectId: null,
    isSaved: true,
    hasUnpushedChanges: false,
    syncStatus: 'idle',
    comments: [],
    commentsExpanded: false,

    // ─── Persistent History (VCS) ───────────────────────────────────────────
    versions: [],
    fullVersions: [],
    branches: new Map([['main', '']]),
    currentBranch: 'main',
    currentVersionId: null,

    versionCompareModal: { isOpen: false, versionA: null, versionB: null },

    // ─── UI State ───────────────────────────────────────────────────────────
    searchOpen: false,
    settingsOpen: false,
    helpOpen: false,
    notificationsOpen: false,
    projectThumbnails: {},
    isSaving: false,
    pendingSave: false,
    lastSaveTime: Date.now(),
    lastSaveError: null,

    // ─── Transient History Actions ──────────────────────────────────────────

    pushToHistory: (type: HistoryItem['type'], name: string) => {
        const state = get();
        const currentData = {
            objects: serializeObjects(state.objects),
            code: state.code,
            selectedIds: Array.from(state.selectedIds),
        };

        // Skip if identical to current
        if (state.historyIndex >= 0) {
            const last = state.history[state.historyIndex];
            if (last.code === currentData.code &&
                JSON.stringify(last.objects) === JSON.stringify(currentData.objects)) {
                return;
            }
        }

        const newItem: HistoryItem = {
            id: generateId(),
            type,
            name,
            timestamp: Date.now(),
            ...currentData,
        };

        const newHistory = state.history.slice(0, state.historyIndex + 1);
        newHistory.push(newItem);
        if (newHistory.length > 50) newHistory.shift();

        set({ history: newHistory, historyIndex: newHistory.length - 1, isSaved: false });
    },

    undo: () => {
        const state = get();
        if (state.historyIndex > 0) {
            const item = state.history[state.historyIndex - 1];
            set({
                historyIndex: state.historyIndex - 1,
                objects: cleanObjects(item.objects),
                code: item.code,
                selectedIds: new Set(item.selectedIds),
            });
            get().runCode();
        }
    },

    redo: () => {
        const state = get();
        if (state.historyIndex < state.history.length - 1) {
            const item = state.history[state.historyIndex + 1];
            set({
                historyIndex: state.historyIndex + 1,
                objects: cleanObjects(item.objects),
                code: item.code,
                selectedIds: new Set(item.selectedIds),
            });
            get().runCode();
        }
    },

    goToHistoryIndex: (index: number) => {
        const state = get();
        if (index >= 0 && index < state.history.length) {
            const item = state.history[index];
            set({
                historyIndex: index,
                objects: cleanObjects(item.objects),
                code: item.code,
                selectedIds: new Set(item.selectedIds),
            });
            get().runCode();
        }
    },

    skipToStart: () => get().goToHistoryIndex(0),
    skipToEnd: () => get().goToHistoryIndex(get().history.length - 1),
    stepBack: () => get().undo(),
    stepForward: () => get().redo(),

    // ─── Save / Sync ────────────────────────────────────────────────────────

    saveToLocal: async () => {
        const state = get();
        set({ syncStatus: 'saving_local' });
        try {
            // Capture thumbnail
            if (state.thumbnailCapturer) {
                const thumb = state.thumbnailCapturer();
                if (thumb) state.updateThumbnail(state.fileName, thumb);
            }

            const projectData = buildProjectData(get());

            // Assign a projectId if we don't have one yet
            if (!state.projectId) {
                set({ projectId: projectData.meta.id });
            }

            const mgr = StorageManager.getInstance();
            await mgr.quickStore.saveProject(projectData);

            // Tell the sync engine we have pending changes
            mgr.syncEngine?.markDirty();

            set({
                isSaved: true,
                hasUnpushedChanges: true,
                syncStatus: 'idle',
                lastSaveTime: Date.now(),
            });
        } catch (error) {
            console.error('[VersioningSlice] Local save failed:', error);
            set({ syncStatus: 'error' });
        }
    },

    syncToCloud: async (_force?: boolean) => {
        const state = get();
        if (state.isSaving) return;
        set({ isSaving: true, syncStatus: 'pushing_cloud' });

        try {
            // Save locally first (ensures QuickStore is up to date)
            await get().saveToLocal();

            // Then trigger the sync engine
            const mgr = StorageManager.getInstance();
            await mgr.syncEngine?.syncNow();

            set({
                isSaved: true,
                hasUnpushedChanges: false,
                isSaving: false,
                syncStatus: 'idle',
                lastSaveTime: Date.now(),
            });
        } catch (error: any) {
            console.error('[VersioningSlice] Cloud sync failed:', error);
            set({ isSaving: false, syncStatus: 'error', lastSaveError: error.message });
        }
    },

    save: async (force?: boolean) => get().syncToCloud(force),

    triggerSave: () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        set({ pendingSave: true });
        saveTimeout = setTimeout(() => {
            set({ pendingSave: false });
            get().saveToLocal();
        }, 1000);
    },

    setFileName: (name) => {
        set({ fileName: name, isSaved: false });
        get().triggerSave();
    },

    setProjectId: (id) => set({ projectId: id }),

    // ─── VCS / Versioning ───────────────────────────────────────────────────

    createVersion: (message: string) => {
        const state = get();
        try {
            const mgr = StorageManager.getInstance();
            const projectId = state.projectId;
            if (!projectId) {
                toast.error('Save the project first before creating a commit');
                return;
            }
            // Commit via QuickStore
            mgr.quickStore.commit(projectId, message, 'User').then((hash) => {
                // Refresh history
                mgr.quickStore.getHistory(projectId).then((commits) => {
                    set({ fullVersions: commits as any[], currentVersionId: hash, isSaved: false });
                });
                toast.success('Commit created');
                get().triggerSave();
            }).catch((err: any) => {
                toast.error(`Commit failed: ${err.message}`);
            });
        } catch (error: any) {
            toast.error(`Commit failed: ${error.message}`);
        }
    },

    createBranch: (branchName: string) => {
        const state = get();
        const projectId = state.projectId;
        if (!projectId) return;
        const mgr = StorageManager.getInstance();
        const currentHash = state.currentVersionId ?? '';
        mgr.quickStore.createBranch(projectId, branchName, currentHash).then(() => {
            mgr.quickStore.getBranches(projectId).then((branches) => {
                const map = new Map(branches.map((b) => [b.name, b.sha]));
                set({ branches: map, currentBranch: branchName });
            });
            toast.success(`Branch "${branchName}" created`);
            get().triggerSave();
        }).catch((err: any) => {
            toast.error(err.message);
        });
    },

    checkoutVersion: (target: string) => {
        const state = get();
        const projectId = state.projectId;
        if (!projectId) return;
        const mgr = StorageManager.getInstance();

        // If target is a branch name, switch to it
        if (state.branches.has(target)) {
            mgr.quickStore.switchBranch(projectId, target).then(() => {
                mgr.quickStore.loadProject(projectId).then((data) => {
                    if (data) {
                        set({
                            code: data.snapshot.code,
                            objects: cleanObjects(data.snapshot.objects as any[]),
                            currentBranch: target,
                            history: [{
                                id: 'checkout',
                                type: 'initial',
                                name: `Checkout ${target}`,
                                timestamp: Date.now(),
                                objects: cleanObjects(data.snapshot.objects as any[]),
                                code: data.snapshot.code,
                                selectedIds: [],
                            }],
                            historyIndex: 0,
                        });
                        // Restore persistent sketches
                        if (data.snapshot.sketches?.length) {
                            get().loadSketches(data.snapshot.sketches);
                        }
                        get().runCode();
                    }
                });
                toast.success(`Checked out ${target}`);
            }).catch((err: any) => toast.error(err.message));
        } else {
            toast.info('Checking out specific commits not yet supported');
        }
    },

    // ─── Comments ───────────────────────────────────────────────────────────

    addComment: (text, position) => {
        const comment: Comment = { id: generateId(), text, author: 'User', timestamp: Date.now(), position };
        set((s) => ({ comments: [...s.comments, comment] }));
    },
    deleteComment: (id) => set((s) => ({ comments: s.comments.filter((c) => c.id !== id) })),
    toggleComments: () => set((s) => ({ commentsExpanded: !s.commentsExpanded })),

    // ─── UI Toggles ─────────────────────────────────────────────────────────

    toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
    setSearchOpen: (open) => set({ searchOpen: open }),
    toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
    toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
    toggleNotifications: () => set((s) => ({ notificationsOpen: !s.notificationsOpen })),

    // ─── Project Lifecycle ──────────────────────────────────────────────────

    reset: () => {
        get().clearAllObjects();
        set({
            code: DEFAULT_CODE,
            history: [{
                id: 'initial',
                type: 'initial',
                name: 'Reset Project',
                timestamp: Date.now(),
                objects: [],
                code: DEFAULT_CODE,
                selectedIds: [],
            }],
            historyIndex: 0,
        });
        get().runCode();
    },

    closeProject: async () => {
        if (saveTimeout) clearTimeout(saveTimeout);

        // Final save before close
        const state = get();
        if (!state.isSaved && state.projectId) {
            await get().saveToLocal();
        }

        get().clearAllObjects();
        set({
            fileName: 'Untitled',
            projectId: null,
            code: DEFAULT_CODE,
            history: [],
            historyIndex: -1,
            isSaved: true,
            pendingSave: false,
            versions: [],
            fullVersions: [],
            branches: new Map([['main', '']]),
            currentBranch: 'main',
            currentVersionId: null,
        });
    },

    updateThumbnail: async (name, thumb) => {
        set({ projectThumbnails: { ...get().projectThumbnails, [name]: thumb } });
    },

    removeThumbnail: (name) => {
        const thumbs = { ...get().projectThumbnails };
        delete thumbs[name];
        set({ projectThumbnails: thumbs });
    },

    compareVersions: (versionA, versionB) =>
        set({ versionCompareModal: { isOpen: true, versionA, versionB } }),

    getVersionTree: () => get().fullVersions as any,

    hydrateVCS: (_repoData) => {
        // VCS state is now managed by QuickStore — this is a no-op stub
        // for backward compatibility with components that call it.
    },

    mergeBranch: (_branchName, _targetBranch) => {
        toast.info('Branch merging coming soon');
    },

    setMainBranch: (_versionId) => {
        toast.info('Set main branch coming soon');
    },

    saveAs: (name) => {
        set({ fileName: name, isSaved: false });
        get().triggerSave();
    },

    loadState: (fixture: Record<string, any>) => {
        const patch = buildHydratedPatch(fixture as CADStateFixture);
        set({
            ...patch,
            isSaved: false,
        } as Partial<CADState>);
    },

    open: () => {
        toast.info('Use the Dashboard to open projects');
    },
});

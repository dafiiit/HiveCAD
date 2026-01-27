import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { CADState, VersioningSlice, VersionCommit, Comment } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

let saveTimeout: any = null;

export const createVersioningSlice: StateCreator<
    CADState,
    [],
    [],
    VersioningSlice
> = (set, get) => ({
    history: [],
    historyIndex: -1,
    fileName: 'Untitled',
    isSaved: true,
    comments: [],
    commentsExpanded: false,
    versions: [],
    branches: new Map([['main', '']]),
    currentBranch: 'main',
    currentVersionId: null,
    versionCompareModal: {
        isOpen: false,
        versionA: null,
        versionB: null,
    },
    searchOpen: false,
    settingsOpen: false,
    helpOpen: false,
    notificationsOpen: false,
    projectThumbnails: (() => {
        try {
            return JSON.parse(localStorage.getItem('hivecad_thumbnails') || '{}');
        } catch {
            return {};
        }
    })(),
    isSaving: false,
    pendingSave: false,
    lastSaveTime: Date.now(),
    lastSaveError: null,

    undo: () => console.log("Undo"),
    redo: () => console.log("Redo"),
    goToHistoryIndex: () => { },
    skipToStart: () => { },
    skipToEnd: () => { },
    stepBack: () => { },
    stepForward: () => { },

    save: async (isManual = false) => {
        const state = get();

        // Prevent concurrent saves
        if (state.isSaving) {
            set({ pendingSave: true });
            return;
        }

        try {
            set({ isSaving: true, lastSaveError: null });
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;

            if (isManual) {
                toast.loading(`Saving to ${adapter.name}...`, { id: 'save-toast' });
            }

            const projectData = {
                fileName: state.fileName,
                objects: state.objects,
                code: state.code,
                versions: state.versions,
                branches: state.branches,
                currentBranch: state.currentBranch,
                currentVersionId: state.currentVersionId,
                // thumbnail is removed from here to reduce payload size
            };

            await adapter.save(state.fileName, projectData);

            set({ isSaved: true, isSaving: false, lastSaveTime: Date.now() });

            if (isManual) {
                toast.success(`Saved to ${adapter.name}`, { id: 'save-toast' });
            } else {
                // Remove any existing error toast if auto-save finally succeeded
                toast.dismiss('save-toast');
            }

            // Check if a save was requested while we were saving
            if (get().pendingSave) {
                set({ pendingSave: false });
                get().save(false);
            }
        } catch (error: any) {
            console.error("Save failed:", error);
            const message = error.message || String(error);
            set({ isSaving: false, lastSaveError: message });

            // Only notify if it's a manual save or if it's been failing for a while
            // For now, let's always show error on failure if it's GitHub
            if (isManual || Date.now() - state.lastSaveTime > 60000) {
                if (message.includes('Not authenticated')) {
                    toast.error("GitHub account not linked. Please link your account to save.", { id: 'save-toast' });
                    // Import dynamically to avoid circular dependency if needed, or just use useGlobalStore directly if safe
                    const { useGlobalStore } = require('../useGlobalStore');
                    useGlobalStore.getState().setShowPATDialog(true);
                } else {
                    toast.error(`Save failed: ${message}`, { id: 'save-toast' });
                }
            }
        }
    },
    triggerSave: () => {
        const state = get();
        if (state.pendingSave || state.isSaving) return;

        if (saveTimeout) clearTimeout(saveTimeout);

        set({ pendingSave: true });

        saveTimeout = setTimeout(() => {
            const currentState = get();
            set({ pendingSave: false });
            currentState.save(false);
        }, 3000);
    },
    saveAs: (name) => set({ fileName: name, isSaved: true }),
    open: async () => {
        const { StorageManager } = await import('@/lib/storage/StorageManager');
        const adapter = StorageManager.getInstance().currentAdapter;
        toast.info(`Open from ${adapter.name} not fully implemented yet`);
    },
    reset: () => {
        set({ objects: [], code: 'const main = () => { return; };' });
    },
    setFileName: (name) => set({ fileName: name }),
    closeProject: async () => {
        const state = get();
        // Take a final thumbnail before closing if possible
        const thumbnail = state.projectThumbnails[state.fileName];
        if (thumbnail) {
            try {
                const { StorageManager } = await import('@/lib/storage/StorageManager');
                const adapter = StorageManager.getInstance().currentAdapter;
                if (adapter.saveThumbnail) {
                    await adapter.saveThumbnail(state.fileName, thumbnail);
                }
            } catch (e) {
                console.warn('[versioningSlice] Failed to save final thumbnail on close', e);
            }
        }

        set({
            fileName: 'Untitled',
            objects: [],
            code: 'const main = () => { return; };',
            history: [],
            historyIndex: -1,
            isSaved: true,
            versions: [],
            branches: new Map([['main', '']]),
            currentBranch: 'main',
            currentVersionId: null,
        });
    },
    updateThumbnail: async (name, thumbnail) => {
        const thumbnails = { ...get().projectThumbnails, [name]: thumbnail };
        localStorage.setItem('hivecad_thumbnails', JSON.stringify(thumbnails));
        set({ projectThumbnails: thumbnails });

        // Also save to adapter if connected
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;
            if (adapter.isAuthenticated() && adapter.saveThumbnail) {
                await adapter.saveThumbnail(name, thumbnail);
            }
        } catch (e) {
            console.warn('[versioningSlice] Failed to save thumbnail to adapter', e);
        }
    },

    addComment: (text, position) => {
        const state = get();
        const comment: Comment = {
            id: generateId(),
            text,
            author: 'User',
            timestamp: Date.now(),
            position,
        };
        set({ comments: [...state.comments, comment] });
    },
    deleteComment: (id) => set(state => ({ comments: state.comments.filter(c => c.id !== id) })),
    toggleComments: () => set(state => ({ commentsExpanded: !state.commentsExpanded })),

    toggleSearch: () => set(state => ({ searchOpen: !state.searchOpen })),
    toggleSettings: () => set(state => ({ settingsOpen: !state.settingsOpen })),
    toggleHelp: () => set(state => ({ helpOpen: !state.helpOpen })),
    toggleNotifications: () => set(state => ({ notificationsOpen: !state.notificationsOpen })),

    createVersion: (message) => {
        const state = get();
        const newVersion: VersionCommit = {
            id: generateId(),
            message,
            timestamp: Date.now(),
            author: 'User',
            branch: state.currentBranch,
            parentId: state.currentVersionId,
            snapshot: {
                objects: JSON.parse(JSON.stringify(state.objects)),
                code: state.code,
                historyIndex: state.historyIndex,
            },
        };

        const newBranches = new Map(state.branches);
        newBranches.set(state.currentBranch, newVersion.id);

        set({
            versions: [...state.versions, newVersion],
            branches: newBranches,
            currentVersionId: newVersion.id,
        });
    },

    createBranch: (branchName, fromVersionId) => {
        const state = get();
        const newBranches = new Map(state.branches);
        const baseVersionId = fromVersionId || state.currentVersionId || '';
        newBranches.set(branchName, baseVersionId);

        set({
            branches: newBranches,
            currentBranch: branchName,
        });

        toast.success(`Branch "${branchName}" created`);
    },

    checkoutVersion: (versionId) => {
        const state = get();
        const version = state.versions.find(v => v.id === versionId);
        if (!version) return;

        set({
            objects: JSON.parse(JSON.stringify(version.snapshot.objects)),
            code: version.snapshot.code,
            historyIndex: version.snapshot.historyIndex,
            currentVersionId: version.id,
            currentBranch: version.branch
        });

        // Trigger runCode to update view
        get().runCode();
    },

    mergeBranch: (branchName, targetBranch) => {
        console.log("Merge not implemented yet");
    },

    setMainBranch: (versionId) => {
        console.log("Set main branch not implemented yet");
    },

    compareVersions: (versionA, versionB) => {
        set({
            versionCompareModal: {
                isOpen: true,
                versionA,
                versionB
            }
        });
    },

    getVersionTree: () => {
        // TODO: Implement tree generation if needed
        return null;
    }
});

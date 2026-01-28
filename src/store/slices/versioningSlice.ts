import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { get as idbGet, set as idbSet } from 'idb-keyval';
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
    projectId: null,
    isSaved: true,
    hasUnpushedChanges: false,
    syncStatus: 'idle',
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

    saveToLocal: async () => {
        const state = get();
        set({ syncStatus: 'saving_local' }); // Status update
        try {
            const projectData = {
                fileName: state.fileName,
                objects: JSON.parse(JSON.stringify(state.objects)),
                code: state.code,
                versions: state.versions,
                branches: state.branches,
                currentBranch: state.currentBranch,
                currentVersionId: state.currentVersionId,
            };

            // Capture thumbnail if possible
            if (state.thumbnailCapturer) {
                const thumbnail = state.thumbnailCapturer();
                if (thumbnail) {
                    // Update local state and storage
                    state.updateThumbnail(state.fileName, thumbnail);
                }
            }

            const projectIdentifier = state.projectId || state.fileName || 'unnamed';
            await idbSet(`project:${projectIdentifier}`, projectData);
            set({
                isSaved: true, // Saved locally
                hasUnpushedChanges: true,
                syncStatus: 'idle', // Back to idle after local save, but waiting for push
                lastSaveTime: Date.now()
            });
            console.log("Saved to local storage");
        } catch (error) {
            console.error("Local save failed", error);
            set({ syncStatus: 'error' });
        }
    },

    syncToCloud: async (_force?: boolean) => {
        const state = get();
        if (state.isSaving) return;
        set({ isSaving: true, syncStatus: 'pushing_cloud' });

        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;

            toast.loading(`Syncing to ${adapter.name}...`, { id: 'save-toast' });

            const projectData = {
                name: state.fileName,         // ✓ User-visible name
                fileName: state.fileName,     // ✓ Keep for compatibility
                objects: state.objects,
                code: state.code,
                versions: state.versions,
                branches: state.branches,
                currentBranch: state.currentBranch,
                currentVersionId: state.currentVersionId,
                // thumbnail is removed from here to reduce payload size
            };

            // ✓ CRITICAL: Pass projectId (stable), not fileName (mutable)
            const saveIdentifier = state.projectId || state.fileName || 'unnamed';
            await adapter.save(saveIdentifier, projectData);

            console.log(`[versioningSlice] Synced project ${saveIdentifier}`);

            // Capture and save thumbnail
            let currentThumbnail = state.projectThumbnails[state.fileName];
            if (state.thumbnailCapturer) {
                const captured = state.thumbnailCapturer();
                if (captured) {
                    currentThumbnail = captured;
                    state.updateThumbnail(state.fileName, captured);
                }
            }

            set({ isSaved: true, hasUnpushedChanges: false, isSaving: false, syncStatus: 'idle', lastSaveTime: Date.now() });

            // Ensure thumbnail exists
            if (adapter.saveThumbnail) {
                if (currentThumbnail) {
                    await adapter.saveThumbnail(saveIdentifier, currentThumbnail);
                } else {
                    // Upload default if none exists
                    const DEFAULT_THUMBNAIL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; // Red pixel as placeholder
                    await adapter.saveThumbnail(saveIdentifier, DEFAULT_THUMBNAIL);

                    // Update local state too
                    const newThumbnails = { ...state.projectThumbnails, [state.fileName]: DEFAULT_THUMBNAIL };
                    set({ projectThumbnails: newThumbnails });
                    localStorage.setItem('hivecad_thumbnails', JSON.stringify(newThumbnails));
                }
            }

            toast.success(`Synced to ${adapter.name}`, { id: 'save-toast' });

            // Check if a save was requested while we were saving
            if (get().pendingSave) {
                set({ pendingSave: false });
                get().syncToCloud(_force);
            }
        } catch (error: any) {
            console.error("Save failed:", error);
            const message = error.message || String(error);
            set({ isSaving: false, lastSaveError: message });

            if (message.includes('Not authenticated')) {
                toast.error("GitHub account not linked. Please link your account to save.", { id: 'save-toast' });
                const { useGlobalStore } = await import('../useGlobalStore');
                useGlobalStore.getState().setShowPATDialog(true);
            } else {
                toast.error(`Sync failed: ${message}`, { id: 'save-toast' });
            }
        }
    },

    save: async (force?: boolean) => {
        return get().syncToCloud(force);
    },

    // Updated triggerSave to use local save only
    triggerSave: () => {
        const state = get();
        // If we are already pending a local save, usually we just let the usage extend the timer or similar.
        // But here we just set a timeout.

        if (saveTimeout) clearTimeout(saveTimeout);

        set({ pendingSave: true });

        // Auto-save to local IDB after 1s
        saveTimeout = setTimeout(async () => {
            const currentState = get();
            set({ pendingSave: false });
            await currentState.saveToLocal();
        }, 1000);
    },
    saveAs: (name) => set({ fileName: name, isSaved: true }),
    open: async () => {
        const { StorageManager } = await import('@/lib/storage/StorageManager');
        const adapter = StorageManager.getInstance().currentAdapter;

        // Check local version first
        const currentState = get();
        try {
            const localData: any = await idbGet(`project:${currentState.fileName}`);
            if (localData) {
                // TODO: Compare with cloud version timestamp if available
                // For now, if we have local data and it matches filename, maybe load it?
                // Actually `open` usually isn't called for the current project, it's for opening *another* project.
                // This method body was empty/placeholder before. 
                // We should probably rely on the Caller (UI) to handle loading data.
            }
        } catch (e) { }

        toast.info(`Open from ${adapter.name} not fully implemented yet`);
    },
    reset: () => {
        set({ objects: [], code: 'const main = () => { return; };' });
    },
    setFileName: (name) => {
        const state = get();
        const oldName = state.fileName;

        if (oldName === name) return;

        // Migrate thumbnail
        const oldThumb = state.projectThumbnails[oldName];
        if (oldThumb) {
            const newThumbs = { ...state.projectThumbnails };
            delete newThumbs[oldName];
            newThumbs[name] = oldThumb;
            set({ projectThumbnails: newThumbs });
            localStorage.setItem('hivecad_thumbnails', JSON.stringify(newThumbs));
        }

        set({ fileName: name });

        // ✓ ONLY generate projectId if this is truly a NEW project
        // Don't auto-generate when just changing the name of an existing project
        // ✓ ALWAYS ensure we have a projectId when a project is named
        if (!state.projectId) {
            const newProjectId = generateId();
            set({ projectId: newProjectId });
            console.log(`[versioningSlice] Generated missing projectId: ${newProjectId}`);
        }

        // Trigger save to update GitHub index with new name
        get().triggerSave();
    },
    setProjectId: (id) => {
        set({ projectId: id });
        console.log(`[versioningSlice] Set projectId: ${id}`);
    },
    closeProject: async () => {
        const state = get();

        // 1. CLEAR TIMER to prevent the empty-state overwrite
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }

        // 2. FORCE SAVE if there are pending changes
        if (state.pendingSave) {
            await state.saveToLocal();
        }

        // Take a final thumbnail before closing if possible
        const thumbnail = state.projectThumbnails[state.fileName];
        if (thumbnail) {
            try {
                const { StorageManager } = await import('@/lib/storage/StorageManager');
                const adapter = StorageManager.getInstance().currentAdapter;
                if (adapter.saveThumbnail) {
                    const identifier = state.projectId || state.fileName || 'unnamed';
                    await adapter.saveThumbnail(identifier, thumbnail);
                }
            } catch (e) {
                console.warn('[versioningSlice] Failed to save final thumbnail on close', e);
            }
        }

        set({
            fileName: 'Untitled',
            projectId: null, // Ensure this is null so we don't overwrite the old ID
            objects: [],
            code: 'const main = () => { return; };',
            history: [],
            historyIndex: -1,
            isSaved: true,
            pendingSave: false,
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
                const state = get();
                const identifier = (state.fileName === name ? state.projectId : null) || name || 'unnamed';
                await adapter.saveThumbnail(identifier, thumbnail);
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

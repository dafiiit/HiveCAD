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
        set({ syncStatus: 'saving_local' });
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

            if (state.thumbnailCapturer) {
                const thumbnail = state.thumbnailCapturer();
                if (thumbnail) {
                    state.updateThumbnail(state.fileName, thumbnail);
                }
            }

            const projectIdentifier = state.projectId || state.fileName || 'unnamed';
            await idbSet(`project:${projectIdentifier}`, projectData);
            set({
                isSaved: true,
                hasUnpushedChanges: true,
                syncStatus: 'idle',
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

            // toast.loading(`Syncing to ${adapter.name}...`, { id: 'save-toast' });

            const projectData = {
                name: state.fileName,
                fileName: state.fileName,
                objects: state.objects,
                code: state.code,
                versions: state.versions,
                branches: state.branches,
                currentBranch: state.currentBranch,
                currentVersionId: state.currentVersionId,
            };

            const saveIdentifier = state.projectId || state.fileName || 'unnamed';
            await adapter.save(saveIdentifier, projectData);

            console.log(`[versioningSlice] Synced project ${saveIdentifier}`);

            // CRITICAL: Update index.json to register the project
            if (adapter.updateIndex && state.projectId && state.fileName !== 'Untitled') {
                try {
                    await adapter.updateIndex(state.projectId, {
                        id: state.projectId,
                        name: state.fileName,
                        lastModified: Date.now(),
                    });
                    console.log(`[versioningSlice] Updated index.json for project ${state.projectId}`);
                } catch (indexError) {
                    console.warn('[versioningSlice] Failed to update index.json', indexError);
                }
            }

            let currentThumbnail = state.projectThumbnails[state.fileName];
            if (state.thumbnailCapturer) {
                const captured = state.thumbnailCapturer();
                if (captured) {
                    currentThumbnail = captured;
                    state.updateThumbnail(state.fileName, captured);
                }
            }

            set({ isSaved: true, hasUnpushedChanges: false, isSaving: false, syncStatus: 'idle', lastSaveTime: Date.now() });

            if (adapter.saveThumbnail) {
                if (currentThumbnail) {
                    await adapter.saveThumbnail(saveIdentifier, currentThumbnail);
                } else {
                    const DEFAULT_THUMBNAIL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
                    await adapter.saveThumbnail(saveIdentifier, DEFAULT_THUMBNAIL);

                    const newThumbnails = { ...state.projectThumbnails, [state.fileName]: DEFAULT_THUMBNAIL };
                    set({ projectThumbnails: newThumbnails });
                    localStorage.setItem('hivecad_thumbnails', JSON.stringify(newThumbnails));
                }
            }

            // toast.success(`Synced to ${adapter.name}`, { id: 'save-toast' });

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

    triggerSave: () => {
        const state = get();
        if (saveTimeout) clearTimeout(saveTimeout);

        set({ pendingSave: true });

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

        const currentState = get();
        try {
            const localData: any = await idbGet(`project:${currentState.fileName}`);
            if (localData) {
                // Local data exists
            }
        } catch (e) { }

        toast.info(`Open from ${adapter.name} not fully implemented yet`);
    },

    reset: () => {
        set({
            objects: [],
            code: 'const main = () => { return; };',
            planeVisibility: {
                XY: true,
                XZ: true,
                YZ: true,
            }
        });
    },

    setFileName: (name) => {
        const state = get();
        const oldName = state.fileName;

        if (oldName === name) return;

        const oldThumb = state.projectThumbnails[oldName];
        if (oldThumb) {
            const newThumbs = { ...state.projectThumbnails };
            delete newThumbs[oldName];
            newThumbs[name] = oldThumb;
            set({ projectThumbnails: newThumbs });
            localStorage.setItem('hivecad_thumbnails', JSON.stringify(newThumbs));
        }

        set({ fileName: name });

        if (!state.projectId) {
            const newProjectId = generateId();
            set({ projectId: newProjectId });
            console.log(`[versioningSlice] Generated missing projectId: ${newProjectId}`);
        }

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

        // 2. CAPTURE CURRENT PROJECT DATA BEFORE CLEARING STATE
        const currentProjectId = state.projectId;
        const currentFileName = state.fileName;
        const currentCode = state.code;
        const currentObjects = state.objects;

        // 3. ALWAYS save locally before close (fast, non-blocking to UI)
        if (currentProjectId && currentFileName !== 'Untitled') {
            console.log(`[versioningSlice] Saving project ${currentProjectId} before close`);

            // Build project data snapshot
            const projectSnapshot = {
                id: currentProjectId,
                name: currentFileName,
                lastModified: Date.now(),
                files: { code: currentCode },
                objects: JSON.parse(JSON.stringify(currentObjects)),
                version: '1.0.0',
            };

            // 3a. Save to local IDB (fast) - await this one
            try {
                await idbSet(`project:${currentProjectId}`, projectSnapshot);
                console.log(`[versioningSlice] Saved project ${currentProjectId} to local cache`);
            } catch (e) {
                console.error('[versioningSlice] Failed to save to local cache', e);
            }

            // 3b. Capture and save thumbnail locally
            let thumbnail = state.projectThumbnails[currentFileName];
            if (!thumbnail && state.thumbnailCapturer) {
                thumbnail = state.thumbnailCapturer();
            }
            if (thumbnail) {
                const thumbnails = { ...state.projectThumbnails, [currentFileName]: thumbnail };
                localStorage.setItem('hivecad_thumbnails', JSON.stringify(thumbnails));
            }

            // 3c. Fire-and-forget cloud sync (non-blocking - runs after state clear)
            const syncData = { projectSnapshot, thumbnail, currentProjectId, currentFileName };
            setTimeout(async () => {
                try {
                    const { StorageManager } = await import('@/lib/storage/StorageManager');
                    const adapter = StorageManager.getInstance().currentAdapter;
                    if (adapter.isAuthenticated()) {
                        // Save project data
                        await adapter.save(syncData.currentProjectId, syncData.projectSnapshot);
                        console.log(`[versioningSlice] Background: saved project ${syncData.currentProjectId}`);

                        // Update index
                        if (adapter.updateIndex) {
                            await adapter.updateIndex(syncData.currentProjectId, {
                                id: syncData.currentProjectId,
                                name: syncData.currentFileName,
                                lastModified: Date.now(),
                            });
                            console.log(`[versioningSlice] Background: updated index for ${syncData.currentProjectId}`);
                        }

                        // Save thumbnail
                        if (syncData.thumbnail && adapter.saveThumbnail) {
                            await adapter.saveThumbnail(syncData.currentProjectId, syncData.thumbnail);
                            console.log(`[versioningSlice] Background: saved thumbnail for ${syncData.currentProjectId}`);
                        }

                        console.log(`[versioningSlice] Background sync complete for ${syncData.currentProjectId}`);
                    }
                } catch (e) {
                    console.warn('[versioningSlice] Background sync failed (will retry on next open)', e);
                }
            }, 0);
        }

        // 4. IMMEDIATELY clear state (don't wait for cloud sync)
        set({
            fileName: 'Untitled',
            projectId: null,
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
            planeVisibility: {
                XY: true,
                XZ: true,
                YZ: true,
            },
        });

        console.log('[versioningSlice] Project closed successfully');
    },

    updateThumbnail: async (name, thumbnail) => {
        const thumbnails = { ...get().projectThumbnails, [name]: thumbnail };
        localStorage.setItem('hivecad_thumbnails', JSON.stringify(thumbnails));
        set({ projectThumbnails: thumbnails });

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
        return null;
    }
});
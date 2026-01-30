import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { CADState, VersioningSlice, Comment, HistoryItem } from '../types';
import { isProjectEmpty } from '@/lib/storage/projectUtils';
import { VCSEngine } from '../../lib/vcs/VCSEngine';
import { Snapshot, Repository } from '../../lib/vcs/types';

const generateId = () => Math.random().toString(36).substr(2, 9);

const serializeObjects = (objects: any[]): any[] => {
    if (!objects) return [];
    return objects.map(obj => {
        const { geometry, edgeGeometry, ...rest } = obj;
        return JSON.parse(JSON.stringify(rest));
    });
};

const cleanObjects = (objects: any[]): any[] => {
    if (!objects) return [];
    return objects.map(obj => {
        if (!obj) return obj;
        const newObj = { ...obj };
        delete newObj.geometry;
        delete newObj.edgeGeometry;
        return newObj;
    });
};

const vcs = new VCSEngine();
vcs.init({
    code: 'const main = () => {\n  return;\n};',
    objects: []
});
const repo = vcs.getRepoState();

const getNextUntitledName = async (baseProjectId: string): Promise<string> => {
    try {
        const { StorageManager } = await import('@/lib/storage/StorageManager');
        const adapter = StorageManager.getInstance().currentAdapter;

        if (!adapter.listProjects) {
            return `Untitled ${baseProjectId.substring(0, 6)}`;
        }

        const projects = await adapter.listProjects();
        const untitledProjects = projects.filter(p =>
            p.name.startsWith('Untitled') || p.name.startsWith('unnamed')
        );

        // Find highest number
        let maxNum = 0;
        untitledProjects.forEach(p => {
            const match = p.name.match(/\d+$/);
            if (match) {
                const num = parseInt(match[0]);
                if (num > maxNum) maxNum = num;
            }
        });

        return maxNum > 0 ? `Untitled ${maxNum + 1}` : 'Untitled 1';
    } catch (error) {
        console.warn('Failed to generate untitled name:', error);
        return `Untitled ${baseProjectId.substring(0, 6)}`;
    }
};

let saveTimeout: any = null;

export const createVersioningSlice: StateCreator<
    CADState,
    [],
    [],
    VersioningSlice
> = (set, get) => ({
    // Transient History (Undo/Redo)
    history: [
        {
            id: 'initial',
            type: 'initial',
            name: 'Initial State',
            timestamp: Date.now(),
            objects: [],
            code: 'const main = () => {\n  return;\n};',
            selectedIds: [],
        }
    ],
    historyIndex: 0,

    // Project Info
    fileName: 'Untitled',
    projectId: null,
    isSaved: true,
    hasUnpushedChanges: false,
    syncStatus: 'idle',
    comments: [],
    commentsExpanded: false,

    // Persistent History (VCS)
    versions: vcs.getHistory(),
    fullVersions: vcs.getFullHistory(),
    branches: repo.branches,
    currentBranch: repo.head,
    currentVersionId: repo.branches.get(repo.head) || null,

    versionCompareModal: {
        isOpen: false,
        versionA: null,
        versionB: null,
    },

    pushToHistory: (type: HistoryItem['type'], name: string) => {
        const state = get();
        const currentData: Omit<HistoryItem, 'id' | 'timestamp' | 'type' | 'name'> = {
            objects: serializeObjects(state.objects),
            code: state.code,
            selectedIds: Array.from(state.selectedIds),
        };

        // Don't push if change is identical to last history item
        if (state.historyIndex >= 0) {
            const last = state.history[state.historyIndex];
            if (last.code === currentData.code && JSON.stringify(last.objects) === JSON.stringify(currentData.objects)) {
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

        // Limit history size to 50
        if (newHistory.length > 50) {
            newHistory.shift();
        }

        set({
            history: newHistory,
            historyIndex: newHistory.length - 1,
            isSaved: false
        });
    },

    undo: () => {
        const state = get();
        if (state.historyIndex > 0) {
            const newIndex = state.historyIndex - 1;
            const item = state.history[newIndex];
            set({
                historyIndex: newIndex,
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
            const newIndex = state.historyIndex + 1;
            const item = state.history[newIndex];
            set({
                historyIndex: newIndex,
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

    // Storage logic
    saveToLocal: async () => {
        const state = get();
        set({ syncStatus: 'saving_local' });
        try {
            const repoState = vcs.getRepoState();
            const projectData = {
                id: state.projectId,
                name: state.fileName,
                cad: {
                    code: state.code,
                    objects: serializeObjects(state.objects),
                },
                vcs: {
                    commits: Array.from(repoState.commits.entries()),
                    branches: Array.from(repoState.branches.entries()),
                    head: repoState.head
                },
                lastModified: Date.now(),
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

            const repoState = vcs.getRepoState();
            const projectData = {
                id: state.projectId,
                name: state.fileName,
                cad: {
                    code: state.code,
                    objects: serializeObjects(state.objects),
                },
                vcs: {
                    commits: Array.from(repoState.commits.entries()),
                    branches: Array.from(repoState.branches.entries()),
                    head: repoState.head
                },
                lastModified: Date.now(),
            };

            const saveIdentifier = state.projectId || state.fileName || 'unnamed';
            await adapter.save(saveIdentifier, projectData);

            set({ isSaved: true, hasUnpushedChanges: false, isSaving: false, syncStatus: 'idle', lastSaveTime: Date.now() });

            if (get().pendingSave) {
                set({ pendingSave: false });
                get().syncToCloud(_force);
            }
        } catch (error: any) {
            console.error("Save failed:", error);
            set({ isSaving: false, lastSaveError: error.message });
        }
    },

    save: async (force?: boolean) => get().syncToCloud(force),

    triggerSave: () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        set({ pendingSave: true });
        saveTimeout = setTimeout(() => get().saveToLocal(), 1000);
    },

    setFileName: (name) => set({ fileName: name }),
    setProjectId: (id) => set({ projectId: id }),

    // VCS Logic
    createVersion: (message: string) => {
        const state = get();
        const snapshot: Snapshot = {
            code: state.code,
            objects: serializeObjects(state.objects)
        };

        try {
            const commitId = vcs.commit(snapshot, message);
            if (commitId) {
                const repo = vcs.getRepoState();
                set({
                    versions: vcs.getHistory(),
                    fullVersions: vcs.getFullHistory(),
                    branches: repo.branches,
                    currentBranch: repo.head,
                    currentVersionId: commitId,
                    isSaved: false
                });
                get().triggerSave();
                toast.success('Commit created');
            }
        } catch (error: any) {
            toast.error(`Commit failed: ${error.message}`);
        }
    },

    createBranch: (branchName: string) => {
        try {
            vcs.createBranch(branchName);
            const repo = vcs.getRepoState();
            set({
                branches: repo.branches,
                currentBranch: branchName,
                fullVersions: vcs.getFullHistory()
            });
            toast.success(`Branch "${branchName}" created`);
            get().triggerSave();
        } catch (error: any) {
            toast.error(error.message);
        }
    },

    checkoutVersion: (target: string) => {
        try {
            const snapshot = vcs.checkout(target);
            const repo = vcs.getRepoState();

            set({
                code: snapshot.code,
                objects: cleanObjects(snapshot.objects),
                currentBranch: repo.branches.has(repo.head) ? repo.head : 'DETACHED HEAD',
                currentVersionId: repo.branches.has(target) ? repo.branches.get(target)! : target,
                versions: vcs.getHistory(),
                fullVersions: vcs.getFullHistory(),
                history: [{
                    id: 'checkout',
                    type: 'initial',
                    name: `Checkout ${target}`,
                    timestamp: Date.now(),
                    objects: cleanObjects(snapshot.objects),
                    code: snapshot.code,
                    selectedIds: []
                }],
                historyIndex: 0
            });

            get().runCode();
            toast.success(`Checked out ${target}`);
        } catch (error: any) {
            toast.error(error.message);
        }
    },

    // UI State
    searchOpen: false,
    settingsOpen: false,
    helpOpen: false,
    notificationsOpen: false,
    projectThumbnails: {},
    isSaving: false,
    pendingSave: false,
    lastSaveTime: Date.now(),
    lastSaveError: null,

    toggleSearch: () => set(s => ({ searchOpen: !s.searchOpen })),
    setSearchOpen: (open) => set({ searchOpen: open }),
    toggleSettings: () => set(s => ({ settingsOpen: !s.settingsOpen })),
    toggleHelp: () => set(s => ({ helpOpen: !s.helpOpen })),
    toggleNotifications: () => set(s => ({ notificationsOpen: !s.notificationsOpen })),

    // Comments
    addComment: (text, position) => {
        const comment: Comment = { id: generateId(), text, author: 'User', timestamp: Date.now(), position };
        set(s => ({ comments: [...s.comments, comment] }));
    },
    deleteComment: (id) => set(s => ({ comments: s.comments.filter(c => c.id !== id) })),
    toggleComments: () => set(s => ({ commentsExpanded: !s.commentsExpanded })),

    // Misc
    reset: () => {
        get().clearAllObjects();
        set({
            code: 'const main = () => { return; };',
            history: [{
                id: 'initial',
                type: 'initial',
                name: 'Reset Project',
                timestamp: Date.now(),
                objects: [],
                code: 'const main = () => { return; };',
                selectedIds: []
            }],
            historyIndex: 0
        });
        get().runCode();
    },

    closeProject: async () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        get().clearAllObjects();
        set({
            fileName: 'Untitled',
            projectId: null,
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

    updateThumbnail: async (name, thumb) => {
        const thumbs = { ...get().projectThumbnails, [name]: thumb };
        set({ projectThumbnails: thumbs });
    },

    removeThumbnail: (name) => {
        const thumbs = { ...get().projectThumbnails };
        delete thumbs[name];
        set({ projectThumbnails: thumbs });
    },

    compareVersions: (versionA, versionB) => set({ versionCompareModal: { isOpen: true, versionA, versionB } }),
    getVersionTree: () => vcs.getHistory(),
    hydrateVCS: (repoData) => {
        vcs.hydrate(repoData);
        const repo = vcs.getRepoState();
        set({
            versions: vcs.getHistory(),
            fullVersions: vcs.getFullHistory(),
            branches: repo.branches,
            currentBranch: repo.branches.has(repo.head) ? repo.head : 'DETACHED HEAD',
            currentVersionId: repo.branches.has(repo.head) ? repo.branches.get(repo.head)! : repo.head,
        });
    },
    mergeBranch: (branchName, targetBranch) => console.log('Merge not implemented', { branchName, targetBranch }),
    setMainBranch: (versionId) => console.log('Set main branch not implemented', versionId),
    saveAs: (name) => set({ fileName: name, isSaved: true }),
    open: () => console.log('Open not implemented'),
});
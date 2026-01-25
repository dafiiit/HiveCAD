import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { CADState, VersioningSlice, VersionCommit, Comment } from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

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

    undo: () => console.log("Undo"),
    redo: () => console.log("Redo"),
    goToHistoryIndex: () => { },
    skipToStart: () => { },
    skipToEnd: () => { },
    stepBack: () => { },
    stepForward: () => { },

    save: async () => {
        const state = get();
        // Prevent concurrent saves
        /* if (state.isSaving) return; */

        try {
            // We'll need to update the slice to track saving state properly later
            // For now, let's just use the adapter
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;

            toast.loading(`Saving to ${adapter.name}...`, { id: 'save-toast' });

            // Prepare data to save - this would ideally be more structured
            const projectData = {
                fileName: state.fileName,
                objects: state.objects,
                code: state.code,
                versions: state.versions,
                branches: state.branches,
                currentBranch: state.currentBranch,
                currentVersionId: state.currentVersionId,
                thumbnail: state.projectThumbnails[state.fileName]
            };

            await adapter.save(state.fileName, projectData);

            set({ isSaved: true });
            toast.success(`Saved to ${adapter.name}`, { id: 'save-toast' });
        } catch (error: any) {
            console.error("Save failed:", error);
            const message = error.message || String(error);

            if (message.includes('Not authenticated')) {
                toast.error("GitHub account not linked. Please link your account to save.", { id: 'save-toast' });
                set({ showPATDialog: true });
            } else {
                toast.error(`Save failed: ${message}`, { id: 'save-toast' });
            }
        }
    },
    saveAs: (name) => set({ fileName: name, isSaved: true }),
    open: async () => {
        const { StorageManager } = await import('@/lib/storage/StorageManager');
        const adapter = StorageManager.getInstance().currentAdapter;
        toast.info(`Open from ${adapter.name} not fully implemented yet`);
    },
    reset: () => {
        // This is tricky because it affects other slices
        // But since createObjectSlice sets default code, maybe we just reset objects/code
        set({ objects: [], code: 'const main = () => { return; };' });
    },
    setFileName: (name) => set({ fileName: name }),
    closeProject: () => {
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
    updateThumbnail: (name, thumbnail) => {
        const thumbnails = { ...get().projectThumbnails, [name]: thumbnail };
        localStorage.setItem('hivecad_thumbnails', JSON.stringify(thumbnails));
        set({ projectThumbnails: thumbnails });
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

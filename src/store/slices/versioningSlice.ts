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

    undo: () => console.log("Undo"),
    redo: () => console.log("Redo"),
    goToHistoryIndex: () => { },
    skipToStart: () => { },
    skipToEnd: () => { },
    stepBack: () => { },
    stepForward: () => { },

    save: () => set({ isSaved: true }),
    saveAs: (name) => set({ fileName: name, isSaved: true }),
    open: () => { },
    reset: () => {
        // This is tricky because it affects other slices
        // But since createObjectSlice sets default code, maybe we just reset objects/code
        set({ objects: [], code: 'const main = () => { return; };' });
    },
    setFileName: (name) => set({ fileName: name }),

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

import { StateCreator } from 'zustand';
import { CADState, AuthSlice } from '../types';
import { AuthService } from '../../lib/auth/AuthService';

export const createAuthSlice: StateCreator<CADState, [], [], AuthSlice> = (set, get) => ({
    user: null,
    isAutosaveEnabled: false,
    isStorageConnected: false,
    showPATDialog: false,
    authLoaded: false,

    loadSession: () => {
        const user = AuthService.getCurrentUser();
        set({ user, isAutosaveEnabled: !!user?.pat, authLoaded: true });
    },

    login: async (email, password) => {
        const user = await AuthService.login(email, password);
        set({ user, isAutosaveEnabled: !!user.pat });
    },

    signup: async (email, password) => {
        const user = await AuthService.signup(email, password);
        set({ user, isAutosaveEnabled: false });
    },

    logout: () => {
        AuthService.logout();
        set({ user: null, isAutosaveEnabled: false, isStorageConnected: false });
    },

    setShowPATDialog: (show) => set({ showPATDialog: show }),

    setStorageConnected: (connected) => set({ isStorageConnected: connected }),

    setPAT: async (pat) => {
        const user = get().user;
        if (!user) return;

        if (pat) {
            // Verify token before saving
            const { StorageManager } = await import('../../lib/storage/StorageManager');
            const githubAdapter = StorageManager.getInstance().getAdapter('github');
            if (githubAdapter) {
                const connected = await githubAdapter.connect(pat);
                if (!connected) {
                    throw new Error('Invalid GitHub token');
                }
            }
        }

        await AuthService.updatePAT(user.email, pat);
        set({ user: { ...user, pat }, isAutosaveEnabled: !!pat });
    },
});

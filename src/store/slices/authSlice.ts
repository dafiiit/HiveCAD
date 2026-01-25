import { StateCreator } from 'zustand';
import { CADState, AuthSlice } from '../types';
import { AuthService } from '../../lib/auth/AuthService';

export const createAuthSlice: StateCreator<CADState, [], [], AuthSlice> = (set, get) => ({
    user: null,
    isAutosaveEnabled: false,
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
        set({ user: null, isAutosaveEnabled: false });
    },

    setPAT: async (pat) => {
        const user = get().user;
        if (user) {
            await AuthService.updatePAT(user.email, pat);
            set({ user: { ...user, pat }, isAutosaveEnabled: !!pat });
        }
    },
});

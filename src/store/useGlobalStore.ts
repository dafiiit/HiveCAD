import { create } from 'zustand';
import { AuthService } from '../lib/auth/AuthService';
import { User } from './types';

export interface AuthState {
    user: User | null;
    authLoaded: boolean;
    isAutosaveEnabled: boolean;
    isStorageConnected: boolean;
    showPATDialog: boolean;

    loadSession: () => Promise<void>;
    initializeAuth: () => () => void;
    login: (email: string, pass: string) => Promise<void>;
    signup: (email: string, pass: string) => Promise<void>;
    signInWithOAuth: (provider: 'github') => Promise<void>;
    logout: () => Promise<void>;
    setShowPATDialog: (show: boolean) => void;
    setStorageConnected: (connected: boolean) => void;
    setPAT: (pat: string) => Promise<void>;
}

export const useGlobalStore = create<AuthState>((set, get) => ({
    user: null,
    isAutosaveEnabled: false,
    isStorageConnected: false,
    showPATDialog: false,
    authLoaded: false,

    loadSession: async () => {
        const user = await AuthService.getCurrentUser();
        set({ user, isAutosaveEnabled: !!user?.pat, authLoaded: true });
    },

    initializeAuth: () => {
        const { data: { subscription } } = AuthService.onAuthStateChange((event, user) => {
            console.log(`[GlobalStore] Auth state changed: ${event}`, user);

            // Should update state on any relevant auth event
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
                set({ user, isAutosaveEnabled: !!user?.pat, authLoaded: true });
            } else if (event === 'SIGNED_OUT') {
                set({ user: null, isAutosaveEnabled: false, isStorageConnected: false, authLoaded: true });
            }
        });

        // Initial check in case onAuthStateChange doesn't fire immediately for existing session
        AuthService.getCurrentUser().then(user => {
            // Only set if we haven't received an event yet or if it matches
            if (!get().authLoaded) {
                set({ user, isAutosaveEnabled: !!user?.pat, authLoaded: true });
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    },

    login: async (email, password) => {
        const user = await AuthService.login(email, password);
        set({ user, isAutosaveEnabled: !!user.pat });
    },

    signup: async (email, password) => {
        const user = await AuthService.signup(email, password);
        set({ user, isAutosaveEnabled: false });
    },

    signInWithOAuth: async (provider) => {
        await AuthService.signInWithOAuth(provider);
    },

    logout: async () => {
        await AuthService.logout();
        set({ user: null, isAutosaveEnabled: false, isStorageConnected: false });
    },

    setShowPATDialog: (show) => set({ showPATDialog: show }),

    setStorageConnected: (connected) => set({ isStorageConnected: connected }),

    setPAT: async (pat) => {
        const user = get().user;
        if (!user) return;

        if (pat) {
            // Verify token before saving
            const { StorageManager } = await import('../lib/storage/StorageManager');
            const githubAdapter = StorageManager.getInstance().getAdapter('github');
            if (githubAdapter) {
                const connected = await githubAdapter.connect(pat);
                if (!connected) {
                    throw new Error('Invalid GitHub token');
                }
            }
        }

        await AuthService.updatePAT(user.email, pat);
        set({
            user: { ...user, pat },
            isAutosaveEnabled: !!pat,
            isStorageConnected: !!pat
        });
    },
}));

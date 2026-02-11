import { create } from 'zustand';
import { AuthService } from '../lib/auth/AuthService';
import { User } from './types';
import { StorageManager } from '../lib/storage/StorageManager';

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
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
                set({ user, isAutosaveEnabled: !!user?.pat, authLoaded: true });
            } else if (event === 'SIGNED_OUT') {
                set({ user: null, isAutosaveEnabled: false, isStorageConnected: false, authLoaded: true });
            }
        });

        AuthService.getCurrentUser().then(user => {
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
        // Disconnect remote store on logout
        const mgr = StorageManager.getInstance();
        await mgr.disconnectRemote();

        await AuthService.logout();
        set({ user: null, isAutosaveEnabled: false, isStorageConnected: false });
    },

    setShowPATDialog: (show) => set({ showPATDialog: show }),

    setStorageConnected: (connected) => set({ isStorageConnected: connected }),

    setPAT: async (pat) => {
        const user = get().user;
        if (!user) return;

        if (pat) {
            // Initialize StorageManager if needed
            const mgr = StorageManager.getInstance();
            if (!mgr.isInitialized) {
                await mgr.initialize(
                    () => get().user?.id ?? null,
                    () => get().user?.email ?? null,
                );
            }

            // Connect the remote store (GitHub)
            const connected = await mgr.connectRemote(pat);
            if (!connected) {
                throw new Error('Invalid GitHub token');
            }
        }

        await AuthService.updatePAT(user.email, pat);
        set({
            user: { ...user, pat },
            isAutosaveEnabled: !!pat,
            isStorageConnected: !!pat,
        });
    },
}));

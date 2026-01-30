import { supabase } from './supabase';
import { Provider } from '@supabase/supabase-js';

/**
 * AuthService to handle authentication and session management using Supabase.
 */
export class AuthService {
    static async signup(email: string, password: string): Promise<any> {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) throw error;

        const userData = {
            id: data.user?.id,
            email: data.user?.email
        };
        return userData;
    }

    static async login(email: string, password: string): Promise<any> {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        const userData = {
            id: data.user?.id,
            email: data.user?.email,
            // In a real app, you might store the PAT in a user profile table in Supabase
            // For now, we'll keep the PAT logic if it exists in the user metadata or similar
            pat: data.user?.user_metadata?.pat || null
        };
        return userData;
    }

    static async signInWithOAuth(provider: Provider): Promise<void> {
        const redirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin;
        console.log('Starting OAuth sign-in with redirect URL:', redirectUrl);
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: redirectUrl,
            },
        });

        if (error) throw error;
    }

    static async updatePAT(email: string, pat: string | null): Promise<void> {
        // Update user metadata in Supabase
        const { error } = await supabase.auth.updateUser({
            data: { pat }
        });

        if (error) throw error;
    }

    static async getCurrentUser(): Promise<any | null> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return null;

        return {
            id: session.user.id,
            email: session.user.email,
            pat: session.user.user_metadata?.pat || null
        };
    }

    static async logout(): Promise<void> {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }

    static onAuthStateChange(callback: (event: string, session: any) => void) {
        return supabase.auth.onAuthStateChange((event, session) => {
            const user = session ? {
                id: session.user.id,
                email: session.user.email,
                pat: session.user.user_metadata?.pat || null
            } : null;
            callback(event, user);
        });
    }
}

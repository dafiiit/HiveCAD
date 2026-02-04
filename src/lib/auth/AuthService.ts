import { supabase, isSupabaseConfigured } from './supabase';
import { Provider } from '@supabase/supabase-js';
import { isDesktop } from '../platform/platform';

/**
 * AuthService to handle authentication and session management using Supabase.
 */
export class AuthService {
    private static deepLinkUnsubscribe: (() => void) | null = null;

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
        // Prevent OAuth attempts when Supabase isn't properly configured
        if (!isSupabaseConfigured) {
            throw new Error('Supabase is not configured. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set and rebuild the app.');
        }

        const baseRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin;

        // Use deep link scheme for desktop
        const redirectUrl = isDesktop()
            ? 'hivecad://auth/callback'
            : baseRedirectUrl;

        console.log('Starting OAuth sign-in with redirect URL:', redirectUrl);

        if (isDesktop()) {
            // Set up deep link listener for OAuth callback
            await this.setupDesktopAuthListener();

            // Get OAuth URL and open in system browser
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: redirectUrl,
                    skipBrowserRedirect: true, // Don't redirect in webview
                },
            });

            if (error) throw error;

            // Open the auth URL in system browser
            if (data.url) {
                const { openUrl } = await import('../platform/desktop');
                await openUrl(data.url);
            }
            return;
        }

        // Web flow - standard redirect
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: redirectUrl,
            },
        });

        if (error) throw error;
    }

    /**
     * Set up deep link listener for desktop OAuth callback
     */
    private static async setupDesktopAuthListener(): Promise<void> {
        if (!isDesktop()) return;

        // Clean up existing listener
        if (this.deepLinkUnsubscribe) {
            this.deepLinkUnsubscribe();
        }

        const { onDeepLink } = await import('../platform/desktop');

        this.deepLinkUnsubscribe = await onDeepLink(async (url: string) => {
            console.log('[AuthService] Deep link received:', url);

            // Parse the callback URL for access token
            if (url.includes('auth/callback')) {
                try {
                    // Replace custom scheme with https for URL parsing
                    const urlObj = new URL(url.replace('hivecad://', 'https://'));

                    // Try to get tokens from hash first (implicit flow)
                    let accessToken: string | null = null;
                    let refreshToken: string | null = null;

                    if (urlObj.hash && urlObj.hash.length > 1) {
                        const hashParams = new URLSearchParams(urlObj.hash.slice(1));
                        accessToken = hashParams.get('access_token');
                        refreshToken = hashParams.get('refresh_token');
                        console.log('[AuthService] Tokens from hash:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });
                    }

                    // Fallback to query params if not in hash
                    if (!accessToken) {
                        accessToken = urlObj.searchParams.get('access_token');
                        refreshToken = urlObj.searchParams.get('refresh_token');
                        console.log('[AuthService] Tokens from query:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });
                    }

                    // Check for error in the callback
                    const error = urlObj.searchParams.get('error') ||
                        (urlObj.hash && new URLSearchParams(urlObj.hash.slice(1)).get('error'));
                    if (error) {
                        console.error('[AuthService] OAuth error:', error, urlObj.searchParams.get('error_description'));
                        return;
                    }

                    if (accessToken && refreshToken) {
                        // Set session in Supabase
                        await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken,
                        });
                        console.log('[AuthService] Desktop OAuth successful - session set');
                    } else {
                        console.warn('[AuthService] OAuth callback received but no tokens found in URL:', url);
                    }
                } catch (error) {
                    console.error('[AuthService] Failed to process OAuth callback:', error);
                }
            }
        });
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

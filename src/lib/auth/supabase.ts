import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isDesktop } from '../platform/platform';
import { SupabaseStorageAdapter } from '../storage/SupabaseStorageAdapter';

// Environment variables are baked in at build time by Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Track if Supabase is properly configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
    console.error('[Supabase] CRITICAL: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing!');
    console.error('[Supabase] Ensure .env file exists with proper values and rebuild the app.');
    console.error('[Supabase] Current values:', {
        url: supabaseUrl ? '(set)' : '(missing)',
        key: supabaseAnonKey ? '(set)' : '(missing)'
    });
}

// Create client with actual values, or use placeholder that will fail gracefully
// The placeholder URL is valid format but won't work - prevents createClient from throwing
export const supabase: SupabaseClient = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder',
    isDesktop() ? {
        auth: {
            storage: new SupabaseStorageAdapter(),
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        }
    } : undefined
);


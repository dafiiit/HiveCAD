import { createClient } from '@supabase/supabase-js';

// Environment variables are baked in at build time by Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Supabase] CRITICAL: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing!');
    console.error('[Supabase] Ensure .env file exists with proper values and rebuild the app.');
}

// Create client with actual values - will fail gracefully if not configured
// rather than redirecting to placeholder.supabase.co
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

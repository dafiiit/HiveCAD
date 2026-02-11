import { SupportedStorage } from '@supabase/supabase-js';
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile, remove } from '@tauri-apps/plugin-fs';

/**
 * A storage adapter for Supabase that persists the session to the local filesystem.
 * This is used to maintain the user's session even after the application is closed.
 */
export class SupabaseStorageAdapter implements SupportedStorage {
    async getItem(key: string): Promise<string | null> {
        try {
            if (await exists(key, { baseDir: BaseDirectory.AppLocalData })) {
                return await readTextFile(key, { baseDir: BaseDirectory.AppLocalData });
            }
            return null;
        } catch (error) {
            console.error('Error reading session from storage:', error);
            return null;
        }
    }

    async setItem(key: string, value: string): Promise<void> {
        try {
            // Ensure the directory exists
            if (!(await exists('', { baseDir: BaseDirectory.AppLocalData }))) {
                await mkdir('', { baseDir: BaseDirectory.AppLocalData, recursive: true });
            }
            await writeTextFile(key, value, { baseDir: BaseDirectory.AppLocalData });
        } catch (error) {
            console.error('Error writing session to storage:', error);
        }
    }

    async removeItem(key: string): Promise<void> {
        try {
            if (await exists(key, { baseDir: BaseDirectory.AppLocalData })) {
                await remove(key, { baseDir: BaseDirectory.AppLocalData });
            }
        } catch (error) {
            console.error('Error removing session from storage:', error);
        }
    }
}

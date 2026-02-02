/**
 * Desktop-specific implementations using Tauri APIs
 * 
 * This module provides wrappers around Tauri APIs for:
 * - File system operations
 * - Git operations
 * - App updates
 * - Deep linking
 */

import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { open } from '@tauri-apps/plugin-shell';
import { listen } from '@tauri-apps/api/event';

// ============================================
// File System Operations
// ============================================

/**
 * Get the projects directory path
 */
export async function getProjectsDir(): Promise<string> {
    return invoke<string>('get_projects_dir');
}

/**
 * Write a project to disk
 */
export async function writeProject(projectId: string, data: string): Promise<void> {
    await invoke('write_project', { projectId, data });
}

/**
 * Read a project from disk
 */
export async function readProject(projectId: string): Promise<string | null> {
    return invoke<string | null>('read_project', { projectId });
}

/**
 * List all projects
 */
export async function listProjects(): Promise<string[]> {
    return invoke<string[]>('list_projects');
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<void> {
    await invoke('delete_project', { projectId });
}

// ============================================
// Git Operations
// ============================================

/**
 * Initialize git repository
 */
export async function gitInit(): Promise<void> {
    await invoke('git_init');
}

/**
 * Set remote origin URL
 */
export async function gitSetRemote(url: string): Promise<void> {
    await invoke('git_set_remote', { url });
}

/**
 * Commit all changes with a message
 */
export async function gitCommit(message: string): Promise<void> {
    await invoke('git_commit', { message });
}

/**
 * Get git status
 */
export async function gitStatus(): Promise<string> {
    return invoke<string>('git_status');
}

/**
 * Sync with remote (pull --rebase && push)
 */
export async function gitSync(token?: string): Promise<void> {
    await invoke('git_sync', { token });
}

// ============================================
// App Updates
// ============================================

export interface UpdateInfo {
    version: string;
    currentVersion: string;
    body?: string;
    date?: string;
}

/**
 * Check for available updates
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
    try {
        const update = await check();
        if (update?.available) {
            return {
                version: update.version,
                currentVersion: update.currentVersion,
                body: update.body ?? undefined,
                date: update.date ?? undefined,
            };
        }
        return null;
    } catch (error) {
        console.error('Failed to check for updates:', error);
        return null;
    }
}

/**
 * Download and install update
 */
export async function installUpdate(): Promise<void> {
    const update = await check();
    if (update?.available) {
        await update.downloadAndInstall();
    }
}

// ============================================
// Deep Linking
// ============================================

export type DeepLinkCallback = (url: string) => void;

/**
 * Listen for deep link events
 */
export async function onDeepLink(callback: DeepLinkCallback): Promise<() => void> {
    const unlisten = await listen<string>('deep-link://new-url', (event) => {
        callback(event.payload);
    });
    return unlisten;
}

/**
 * Open URL in default browser
 */
export async function openUrl(url: string): Promise<void> {
    await open(url);
}

// ============================================
// Secure Storage (for GitHub PAT)
// ============================================

const PAT_STORAGE_KEY = 'hivecad_github_pat';

/**
 * Store GitHub PAT securely
 * Note: For production, consider using tauri-plugin-keyring for system keychain
 */
export async function storeGitHubPat(pat: string): Promise<void> {
    // For now, use localStorage. In production, use keychain
    localStorage.setItem(PAT_STORAGE_KEY, pat);
}

/**
 * Retrieve stored GitHub PAT
 */
export async function getGitHubPat(): Promise<string | null> {
    return localStorage.getItem(PAT_STORAGE_KEY);
}

/**
 * Clear stored GitHub PAT
 */
export async function clearGitHubPat(): Promise<void> {
    localStorage.removeItem(PAT_STORAGE_KEY);
}

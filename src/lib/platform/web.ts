/**
 * Web-specific implementations
 *
 * todo:everything Implement or provide web fallbacks for desktop-only APIs as needed.
 * These are stubs or web-specific implementations that match
 * the desktop API surface for consistent usage.
 */

// ============================================
// File System Operations (Not available on web)
// ============================================

export async function getProjectsDir(): Promise<string> {
    throw new Error('File system operations are not available in web mode');
}

export async function writeProject(_projectId: string, _data: string): Promise<void> {
    throw new Error('File system operations are not available in web mode');
}

export async function readProject(_projectId: string): Promise<string | null> {
    throw new Error('File system operations are not available in web mode');
}

export async function listProjects(): Promise<string[]> {
    throw new Error('File system operations are not available in web mode');
}

export async function deleteProject(_projectId: string): Promise<void> {
    throw new Error('File system operations are not available in web mode');
}

// ============================================
// Git Operations (Not available on web)
// ============================================

export async function gitInit(): Promise<void> {
    throw new Error('Git operations are not available in web mode');
}

export async function gitSetRemote(_url: string): Promise<void> {
    throw new Error('Git operations are not available in web mode');
}

export async function gitCommit(_message: string): Promise<void> {
    throw new Error('Git operations are not available in web mode');
}

export async function gitStatus(): Promise<string> {
    throw new Error('Git operations are not available in web mode');
}

export async function gitSync(_token?: string): Promise<void> {
    throw new Error('Git operations are not available in web mode');
}

// ============================================
// App Updates (Not available on web)
// ============================================

export interface UpdateInfo {
    version: string;
    currentVersion: string;
    body?: string;
    date?: string;
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
    // Web apps update automatically via deployment
    return null;
}

export async function installUpdate(): Promise<void> {
    // No-op for web
    console.log('Web apps update automatically');
}

// ============================================
// Deep Linking (Not used on web)
// ============================================

export type DeepLinkCallback = (url: string) => void;

export async function onDeepLink(_callback: DeepLinkCallback): Promise<() => void> {
    // Not applicable for web
    return () => { };
}

export async function openUrl(url: string): Promise<void> {
    window.open(url, '_blank');
}

// ============================================
// Secure Storage (Web fallback)
// ============================================

const PAT_STORAGE_KEY = 'hivecad_github_pat';

export async function storeGitHubPat(pat: string): Promise<void> {
    // Web uses PAT from Supabase session
    console.warn('PAT storage is handled by Supabase on web');
    localStorage.setItem(PAT_STORAGE_KEY, pat);
}

export async function getGitHubPat(): Promise<string | null> {
    return localStorage.getItem(PAT_STORAGE_KEY);
}

export async function clearGitHubPat(): Promise<void> {
    localStorage.removeItem(PAT_STORAGE_KEY);
}

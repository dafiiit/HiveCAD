/**
 * Platform module index
 * 
 * Exports unified platform utilities and conditionally loads
 * platform-specific implementations.
 */

export * from './platform';

// Re-export platform-specific modules
// The actual module loaded depends on the build mode and runtime detection
import { isDesktop } from './platform';

// Type definitions for the platform API
export interface PlatformApi {
    getProjectsDir: () => Promise<string>;
    writeProject: (projectId: string, data: string) => Promise<void>;
    readProject: (projectId: string) => Promise<string | null>;
    listProjects: () => Promise<string[]>;
    deleteProject: (projectId: string) => Promise<void>;
    gitInit: () => Promise<void>;
    gitSetRemote: (url: string) => Promise<void>;
    gitCommit: (message: string) => Promise<void>;
    gitStatus: () => Promise<string>;
    gitSync: (token?: string) => Promise<void>;
    checkForUpdates: () => Promise<{ version: string; currentVersion: string; body?: string; date?: string } | null>;
    installUpdate: () => Promise<void>;
    onDeepLink: (callback: (url: string) => void) => Promise<() => void>;
    openUrl: (url: string) => Promise<void>;
    storeGitHubPat: (pat: string) => Promise<void>;
    getGitHubPat: () => Promise<string | null>;
    clearGitHubPat: () => Promise<void>;
}

/**
 * Get the platform-specific API
 * Dynamically imports the correct module based on platform
 */
export async function getPlatformApi(): Promise<PlatformApi> {
    if (isDesktop()) {
        return import('./desktop');
    }
    return import('./web');
}

// For synchronous access when platform is already known
let cachedApi: PlatformApi | null = null;

/**
 * Initialize platform API (call once at app startup)
 */
export async function initPlatformApi(): Promise<PlatformApi> {
    if (!cachedApi) {
        cachedApi = await getPlatformApi();
    }
    return cachedApi;
}

/**
 * Get cached platform API (throws if not initialized)
 */
export function getPlatformApiSync(): PlatformApi {
    if (!cachedApi) {
        throw new Error('Platform API not initialized. Call initPlatformApi() first.');
    }
    return cachedApi;
}

/**
 * Platform detection utilities
 * 
 * Detects whether the app is running in Tauri (desktop) or web browser mode.
 */

declare global {
    interface Window {
        __TAURI__?: {
            core: unknown;
            [key: string]: unknown;
        };
    }
}

/**
 * Check if running in Tauri desktop environment
 */
export function isDesktop(): boolean {
    return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Check if running in web browser environment
 */
export function isWeb(): boolean {
    return !isDesktop();
}

/**
 * Check if desktop modules should be loaded
 * Uses build mode for tree-shaking optimization
 */
export function shouldLoadDesktopModules(): boolean {
    // In web build mode, always return false for tree-shaking
    if (import.meta.env.MODE === 'web') {
        return false;
    }
    // In development or desktop mode, check runtime
    return isDesktop();
}

/**
 * Get current platform name
 */
export function getPlatformName(): 'desktop' | 'web' {
    return isDesktop() ? 'desktop' : 'web';
}

/**
 * Storage type based on platform
 */
export function getDefaultStorageType(): 'local' | 'github' {
    return isDesktop() ? 'local' : 'github';
}

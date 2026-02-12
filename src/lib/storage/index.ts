/**
 * Barrel export for the storage layer.
 */
export * from './types';
export { StorageManager } from './StorageManager';
export { IdbQuickStore } from './quick/IdbQuickStore';
export { LocalGitQuickStore } from './quick/LocalGitQuickStore';
export { GitHubRemoteStore } from './remote/GitHubRemoteStore';
export { SupabaseMetaService } from './supabase/SupabaseMetaService';
export { SyncEngine } from './sync/SyncEngine';
export * from './debug';

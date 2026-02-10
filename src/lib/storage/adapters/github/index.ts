/**
 * Barrel export for GitHub adapter sub-modules.
 * 
 * This module was refactored from a single 1667-line GitHubAdapter.ts file
 * into focused, single-responsibility services:
 * 
 * - GitHubHelpers: Shared utilities (base64, hashing, retry, commitTree)
 * - GitHubBranchService: Branch & commit history operations
 * - GitHubExtensionService: Community extension marketplace
 * - GitHubRepoService: Repository initialization, reset, maintenance
 * - GitHubSettingsService: User settings persistence
 */
export { utf8ToBase64, hashString, retryOperation, commitTree } from './GitHubHelpers';
export { GitHubBranchService } from './GitHubBranchService';
export { GitHubExtensionService } from './GitHubExtensionService';
export { GitHubRepoService } from './GitHubRepoService';
export { GitHubSettingsService } from './GitHubSettingsService';

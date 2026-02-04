/**
 * LocalGitAdapter - Desktop storage adapter using local file system and git
 * 
 * This adapter is used in Tauri desktop builds to:
 * - Store projects on the local file system
 * - Use git for version control
 * - Sync with remote GitHub repository
 */

import { StorageAdapter, StorageType, ProjectData, CommitInfo, BranchInfo } from '../types';
import * as desktop from '../../platform/desktop';

export class LocalGitAdapter implements StorageAdapter {
    readonly type: StorageType = 'local';
    readonly name = 'Local Git';

    private _isAuthenticated = false;
    private githubPat: string | null = null;
    private remoteUrl: string | null = null;

    async connect(token?: string): Promise<boolean> {
        try {
            // Initialize git repository if needed
            await desktop.gitInit();

            // Store PAT if provided
            if (token) {
                await desktop.storeGitHubPat(token);
                this.githubPat = token;
            } else {
                // Try to load stored PAT
                this.githubPat = await desktop.getGitHubPat();
            }

            this._isAuthenticated = true;
            return true;
        } catch (error) {
            console.error('[LocalGitAdapter] Failed to connect:', error);
            return false;
        }
    }

    async disconnect(): Promise<void> {
        this._isAuthenticated = false;
        this.githubPat = null;
    }

    isAuthenticated(): boolean {
        return this._isAuthenticated;
    }

    /**
     * Set the remote repository URL for syncing
     */
    async setRemoteUrl(url: string): Promise<void> {
        this.remoteUrl = url;
        await desktop.gitSetRemote(url);
    }

    async save(projectId: string, data: any): Promise<void> {
        const projectData: ProjectData = {
            ...(data as ProjectData),
            id: projectId,
            lastModified: Date.now(),
        };

        // Write to local file system
        await desktop.writeProject(projectId, JSON.stringify(projectData, null, 2));

        // Auto-commit
        await desktop.gitCommit(`Update project: ${projectData.name || projectId}`);
    }

    async load(projectId: string): Promise<ProjectData | null> {
        try {
            const content = await desktop.readProject(projectId);
            if (!content) return null;
            return JSON.parse(content) as ProjectData;
        } catch (error) {
            console.error('[LocalGitAdapter] Failed to load project:', error);
            return null;
        }
    }

    async delete(projectId: string): Promise<void> {
        // Soft delete - mark as deleted
        const project = await this.load(projectId);
        if (project) {
            project.deletedAt = Date.now();
            await this.save(projectId, project);
        }
    }

    async permanentlyDelete(projectId: string): Promise<void> {
        await desktop.deleteProject(projectId);
        await desktop.gitCommit(`Delete project: ${projectId}`);
    }

    async rename(projectId: string, newName: string): Promise<void> {
        const project = await this.load(projectId);
        if (project) {
            project.name = newName;
            await this.save(projectId, project);
        }
    }

    async updateMetadata(
        projectId: string,
        updates: Partial<Pick<ProjectData, 'tags' | 'deletedAt' | 'name' | 'lastOpenedAt' | 'folder'>>
    ): Promise<void> {
        const project = await this.load(projectId);
        if (project) {
            Object.assign(project, updates);
            await this.save(projectId, project);
        }
    }

    async saveThumbnail(projectId: string, thumbnail: string): Promise<void> {
        const project = await this.load(projectId);
        if (project) {
            project.thumbnail = thumbnail;
            await this.save(projectId, project);
        }
    }

    async listProjects(): Promise<ProjectData[]> {
        try {
            const projectIds = await desktop.listProjects();
            const projects: ProjectData[] = [];

            for (const id of projectIds) {
                const project = await this.load(id);
                if (project && !project.deletedAt) {
                    projects.push(project);
                }
            }

            return projects.sort((a, b) =>
                (b.lastModified || 0) - (a.lastModified || 0)
            );
        } catch (error) {
            console.error('[LocalGitAdapter] Failed to list projects:', error);
            return [];
        }
    }

    // ============================================
    // Sync Operations
    // ============================================

    /**
     * Sync local changes with remote repository
     */
    async sync(): Promise<void> {
        if (!this.githubPat) {
            throw new Error('GitHub PAT not configured. Please set up sync first.');
        }

        await desktop.gitSync(this.githubPat);
    }

    /**
     * Get git status
     */
    async getStatus(): Promise<string> {
        return desktop.gitStatus();
    }

    // ============================================
    // History (simplified for local)
    // ============================================

    async getHistory(_projectId: string): Promise<CommitInfo[]> {
        // todo:everything Implement using git log
        // For now, return empty - full implementation would parse git log
        console.warn('[LocalGitAdapter] getHistory not fully implemented');
        return [];
    }

    async createBranch(_projectId: string, _sourceSha: string, _branchName: string): Promise<void> {
        // todo:everything Implement branch creation
        console.warn('[LocalGitAdapter] createBranch not implemented');
    }

    async getBranches(_projectId: string): Promise<BranchInfo[]> {
        // todo:everything Implement branch listing
        console.warn('[LocalGitAdapter] getBranches not implemented');
        return [];
    }

    async switchBranch(_branchName: string): Promise<void> {
        // todo:everything Implement branch switching
        console.warn('[LocalGitAdapter] switchBranch not implemented');
    }

    async getCurrentBranch(): Promise<string> {
        return 'main';
    }

    // ============================================
    // Labels & Folders (stored in local config)
    // ============================================

    private async loadLocalConfig(): Promise<any> {
        try {
            const content = await desktop.readProject('_config');
            return content ? JSON.parse(content) : {};
        } catch {
            return {};
        }
    }

    private async saveLocalConfig(config: any): Promise<void> {
        await desktop.writeProject('_config', JSON.stringify(config, null, 2));
        await desktop.gitCommit('Update configuration');
    }

    async listTags(): Promise<Array<{ name: string; color: string }>> {
        const config = await this.loadLocalConfig();
        return config.tags || [];
    }

    async saveTags(tags: Array<{ name: string; color: string }>): Promise<void> {
        const config = await this.loadLocalConfig();
        config.tags = tags;
        await this.saveLocalConfig(config);
    }

    async listFolders(): Promise<Array<{ name: string; color: string }>> {
        const config = await this.loadLocalConfig();
        return config.folders || [];
    }

    async saveFolders(folders: Array<{ name: string; color: string }>): Promise<void> {
        const config = await this.loadLocalConfig();
        config.folders = folders;
        await this.saveLocalConfig(config);
    }

    // ============================================
    // User Settings
    // ============================================

    async saveUserSettings(data: any): Promise<void> {
        const config = await this.loadLocalConfig();
        config.userSettings = data;
        await this.saveLocalConfig(config);
    }

    async loadUserSettings(): Promise<any> {
        const config = await this.loadLocalConfig();
        return config.userSettings || null;
    }

    // ============================================
    // Not Applicable for Local Storage
    // ============================================

    async searchCommunityProjects(_query: string): Promise<any[]> {
        // todo:everything Provide desktop-friendly community search or disable this feature in desktop mode.
        // Community search goes through web API
        console.warn('[LocalGitAdapter] Community search not available in desktop mode');
        return [];
    }

    async searchCommunityExtensions(_query: string): Promise<any[]> {
        // todo:everything Provide desktop-friendly extension search or disable this feature in desktop mode.
        // Community search goes through web API
        console.warn('[LocalGitAdapter] Community extension search not available in desktop mode');
        return [];
    }

    async submitExtension(_extension: any): Promise<string> {
        // todo:everything Support extension submission from desktop mode or guard the UI.
        throw new Error('Extension submission requires web mode');
    }

    async updateExtensionStatus(_extensionId: string, _status: 'development' | 'published'): Promise<void> {
        // todo:everything Support extension status updates from desktop mode or guard the UI.
        throw new Error('Extension status updates require web mode');
    }

    async voteExtension(_extensionId: string, _voteType: 'like' | 'dislike'): Promise<void> {
        // todo:everything Support voting from desktop mode or guard the UI.
        throw new Error('Extension voting requires web mode');
    }

    async incrementExtensionDownloads(_extensionId: string): Promise<void> {
        // todo:everything Support download tracking from desktop mode or guard the UI.
        throw new Error('Extension download tracking requires web mode');
    }

    async createIssue(_title: string, _body: string): Promise<void> {
        // todo:everything Could implement via GitHub API
        console.warn('[LocalGitAdapter] createIssue not implemented');
    }

    async updateIndex(_projectId: string, _updates: Partial<ProjectData>, _isDelete?: boolean): Promise<void> {
        // No index needed for local storage
    }

    async resetRepository(): Promise<void> {
        // todo:everything Implement reset behavior for local repositories.
        console.warn('[LocalGitAdapter] resetRepository not implemented');
    }
}

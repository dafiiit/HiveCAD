import { Octokit } from 'octokit';
import { StorageAdapter, StorageType, ProjectData, CommitInfo, BranchInfo } from '../types';
import { supabase } from '../../auth/supabase';
import { EXAMPLES } from '../../data/examples';

export class GitHubAdapter implements StorageAdapter {
    readonly type: StorageType = 'github';
    readonly name: string = 'GitHub';
    private _isAuthenticated: boolean = false;
    private octokit: Octokit | null = null;
    private authenticatedUser: string | null = null;
    private currentOwner: string | null = null;
    private currentRepo: string | null = null;
    private currentBranchName: string = 'main';
    private thumbnailSavePromises: Map<string, Promise<void>> = new Map();
    private thumbnailDebounceTimers: Map<string, any> = new Map();
    private lastThumbnailHashes: Map<string, string> = new Map();

    async connect(token?: string): Promise<boolean> {
        console.log('[GitHubAdapter] connect() called', token ? '(with token)' : '(without token)');

        let finalToken = token;
        if (!finalToken) {
            console.log('[GitHubAdapter] No token provided to connect()');
            return false;
        }

        try {
            console.log('[GitHubAdapter] Initializing Octokit...');

            this.octokit = new Octokit({
                auth: finalToken,
                // Add some default headers to be safe
                userAgent: 'HiveCAD v1.0'
            });

            console.log('[GitHubAdapter] Fetching authenticated user...');
            const { data: user } = await this.octokit.rest.users.getAuthenticated();
            console.log('[GitHubAdapter] Authenticated as:', user.login);

            this.authenticatedUser = user.login;
            this.currentOwner = user.login;
            // For now, we assume a default repo name or let the user provide one later
            // For this task, we'll use 'hivecad-projects' as a default if not set
            this.currentRepo = 'hivecad-projects';

            this._isAuthenticated = true;
            console.log(`[GitHubAdapter] Connected as ${this.authenticatedUser}`);

            // Initialize repository (ensure exists, set visibility, etc.)
            // We do this once per session to avoid overhead on every save.
            await this.initializeRepository();

            return true;
        } catch (error: any) {
            console.error('[GitHubAdapter] Connection failed error:', error);
            const message = error.message || String(error);
            alert(`GitHub authentication failed: ${message}`);
            return false;
        }
    }

    async disconnect(): Promise<void> {
        this._isAuthenticated = false;
        this.octokit = null;
        this.authenticatedUser = null;
        this.currentOwner = null;
        this.currentRepo = null;
    }

    isAuthenticated(): boolean {
        return this._isAuthenticated;
    }

    private async retryOperation<T>(
        operation: () => Promise<T>,
        onConflict: () => Promise<void>,
        maxRetries = 3
    ): Promise<T> {
        let lastError: any;

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error: any) {
                lastError = error;
                // Check for 409 Conflict or "does not match" error message
                if (error.status === 409 || (error.message && error.message.includes('does not match'))) {
                    console.warn(`[GitHubAdapter] Conflict detected (attempt ${i + 1}/${maxRetries}). Retrying...`);
                    await onConflict();
                    // Add a jittered delay to prevent hammering
                    const delay = 500 * Math.pow(2, i) + Math.random() * 500;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    async save(projectId: string, data: any): Promise<void> {
        if (!this.isAuthenticated() || !this.octokit || !this.authenticatedUser) {
            throw new Error('Not authenticated with GitHub');
        }

        const owner = this.currentOwner;
        const repo = this.currentRepo;

        if (!owner || !repo) {
            throw new Error('GitHub owner/repo not defined');
        }

        if (owner !== this.authenticatedUser) {
            throw new Error('Can only save to repositories owned by the authenticated user');
        }

        // ✓ CRITICAL: Always use projectId for path, never fileName
        const path = `projects/${projectId}/.hivecad/data.json`;

        console.log(`[GitHubAdapter] Saving project ${projectId} to ${owner}/${repo}...`);

        // Prepare data with metadata if not present
        const projectData: ProjectData = {
            id: projectId,                              // ✓ Stable ID for path
            name: data.name || data.fileName || projectId,  // ✓ User-visible name
            ownerId: this.authenticatedUser,
            files: data.files || data,
            version: data.version || '1.0.0',
            lastModified: Date.now(),
            tags: data.tags || [],
            deletedAt: data.deletedAt,
            folder: data.folder,
        };

        const content = btoa(JSON.stringify(projectData, null, 2));

        // State to hold the current SHA
        let sha: string | undefined;
        let existingMetadata: any = null;

        // Helper to fetch current SHA
        const fetchCurrentSha = async () => {
            try {
                const { data: fileData } = await this.octokit!.rest.repos.getContent({
                    owner,
                    repo,
                    path,
                    ref: this.currentBranchName,
                });
                if (!Array.isArray(fileData)) {
                    sha = fileData.sha;
                    if ('content' in fileData) {
                        try {
                            const existingContent = atob(fileData.content.replace(/\n/g, ''));
                            existingMetadata = JSON.parse(existingContent);
                        } catch (e) {
                            console.warn('[GitHubAdapter] Failed to parse existing project data', e);
                        }
                    }
                }
            } catch (error: any) {
                if (error.status !== 404) throw error;
                sha = undefined; // File doesn't exist yet
            }
        };

        // Initial fetch
        await fetchCurrentSha();

        // Perform save with retry
        await this.retryOperation(
            async () => {
                await this.octokit!.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path,
                    message: `Update project ${projectId}`,
                    content,
                    sha,
                    branch: this.currentBranchName,
                });
            },
            async () => {
                // On conflict, re-fetch SHA
                await fetchCurrentSha();
            }
        );

        // Check if metadata actually changed before updating index
        const metadataChanged = !existingMetadata ||
            existingMetadata.name !== projectData.name ||
            JSON.stringify(existingMetadata.tags) !== JSON.stringify(projectData.tags) ||
            existingMetadata.deletedAt !== projectData.deletedAt ||
            existingMetadata.folder !== projectData.folder;

        if (metadataChanged) {
            console.log(`[GitHubAdapter] Metadata changed for ${projectId}, updating index...`);
            await this.updateIndex(projectId, projectData);
        } else {
            console.log(`[GitHubAdapter] Metadata unchanged for ${projectId}, skipping index update.`);
        }

        console.log(`[GitHubAdapter] Saved ${projectId} (name: "${projectData.name}") to ${owner}/${repo}`);

        // Centralized Project Index (Supabase)
        try {
            const { error } = await supabase
                .from('projects')
                .upsert({
                    id: projectId,
                    name: projectData.name,
                    description: (data as any).description || 'A HiveCAD Project',
                    thumbnail_url: `${import.meta.env.VITE_GITHUB_PAGES_URL || `https://raw.githubusercontent.com/${owner}/${repo}/main/`}hivecad/thumbnails/${projectId}.png`,
                    github_owner: owner,
                    github_repo: repo,
                    file_path: path,
                    is_public: true, // For now we assume all projects in this repo are public
                    updated_at: new Date().toISOString(),
                });

            if (error) {
                console.warn('[GitHubAdapter] Failed to upsert to Supabase:', error);
            } else {
                console.log(`[GitHubAdapter] ${projectId} indexed in Supabase`);
            }
        } catch (error) {
            console.warn('[GitHubAdapter] Error syncing with Supabase:', error);
        }
    }

    async updateIndex(projectId: string, updates: Partial<ProjectData>, isDelete = false): Promise<void> {
        if (!this.octokit) return;
        const owner = this.currentOwner!;
        const repo = this.currentRepo!;
        const indexPath = 'hivecad/index.json';

        await this.retryOperation(
            async () => {
                let index: ProjectData[] = [];
                let sha: string | undefined;

                try {
                    const { data: indexFileData } = await this.octokit!.rest.repos.getContent({
                        owner,
                        repo,
                        path: indexPath,
                        ref: this.currentBranchName,
                        headers: {
                            'If-None-Match': '' // Force fresh content from GitHub
                        }
                    });
                    if (!Array.isArray(indexFileData) && 'content' in indexFileData) {
                        const content = atob(indexFileData.content.replace(/\n/g, ''));
                        index = JSON.parse(content);
                        sha = indexFileData.sha;
                    }
                } catch (error: any) {
                    if (error.status !== 404) throw error;
                }

                // Update or remove the project
                const existingIndex = index.findIndex(p => p.id === projectId);
                if (isDelete) {
                    if (existingIndex > -1) index.splice(existingIndex, 1);
                } else {
                    const existingEntry = existingIndex > -1 ? index[existingIndex] : { id: projectId } as ProjectData;
                    const entry = { ...existingEntry, ...updates };
                    delete (entry as any).files; // Don't store full data in index
                    if (existingIndex > -1) {
                        index[existingIndex] = entry as ProjectData;
                    } else {
                        index.push(entry as ProjectData);
                    }
                }

                await this.octokit!.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: indexPath,
                    message: isDelete ? `Remove ${projectId} from index` : `Update ${projectId} in index`,
                    content: btoa(JSON.stringify(index, null, 2)),
                    sha,
                    branch: this.currentBranchName,
                });
            },
            async () => {
                // No specific state needed here
            }
        );
    }

    async delete(projectId: string): Promise<void> {
        // Soft delete: update deletedAt
        await this.updateMetadata(projectId, { deletedAt: Date.now() });
    }

    async permanentlyDelete(projectId: string): Promise<void> {
        if (!this.octokit || !this.currentOwner || !this.currentRepo) {
            throw new Error('Not authenticated with GitHub');
        }

        const owner = this.currentOwner;
        const repo = this.currentRepo;

        console.log(`[GitHubAdapter] Permanently deleting project ${projectId}...`);

        const deleteFileWithRetry = async (path: string, typeName: string) => {
            let currentSha: string | undefined;

            const fetchSha = async () => {
                try {
                    const { data: fileData } = await this.octokit!.rest.repos.getContent({
                        owner,
                        repo,
                        path,
                        ref: this.currentBranchName,
                        headers: { 'If-None-Match': '' }
                    });
                    if (!Array.isArray(fileData)) {
                        currentSha = fileData.sha;
                    }
                } catch (error: any) {
                    if (error.status === 404) {
                        currentSha = undefined;
                    } else {
                        throw error;
                    }
                }
            };

            await fetchSha();
            if (!currentSha) return;

            await this.retryOperation(
                async () => {
                    await this.octokit!.rest.repos.deleteFile({
                        owner,
                        repo,
                        path,
                        message: `Delete ${typeName} for ${projectId}`,
                        sha: currentSha!,
                        branch: this.currentBranchName,
                    });
                },
                async () => {
                    await fetchSha();
                }
            );
        };

        // 1. Delete data file (new path)
        const projectPath = `projects/${projectId}/.hivecad/data.json`;
        try {
            await deleteFileWithRetry(projectPath, 'data file');
        } catch (error: any) {
            if (error.status !== 404) console.warn(`[GitHubAdapter] Unexpected error deleting data file:`, error);
        }

        // 2. Delete legacy data file if exists
        const legacyPath = `hivecad/${projectId}.json`;
        try {
            await deleteFileWithRetry(legacyPath, 'legacy file');
        } catch (error: any) {
            if (error.status !== 404) console.warn(`[GitHubAdapter] Unexpected error deleting legacy file:`, error);
        }

        // 3. Delete thumbnail
        const thumbPath = `hivecad/thumbnails/${projectId}.png`;
        try {
            await deleteFileWithRetry(thumbPath, 'thumbnail');
        } catch (error: any) {
            if (error.status !== 404) console.warn(`[GitHubAdapter] Unexpected error deleting thumbnail:`, error);
        }

        // 4. Update index.json (remove project)
        try {
            await this.updateIndex(projectId, {}, true);
        } catch (error) {
            console.warn(`[GitHubAdapter] Failed to update index:`, error);
        }

        // 5. Delete from Supabase
        try {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', projectId);
            if (error) throw error;
            console.log(`[GitHubAdapter] ${projectId} removed from Supabase`);
        } catch (error) {
            console.warn(`[GitHubAdapter] Failed to delete from Supabase:`, error);
        }
    }

    async rename(projectId: string, newName: string): Promise<void> {
        const data = await this.load(projectId);
        if (!data) throw new Error('Project not found');

        // Update the name and save
        await this.updateMetadata(projectId, { name: newName });
    }

    async updateMetadata(projectId: string, updates: Partial<Pick<ProjectData, 'tags' | 'deletedAt' | 'name' | 'lastOpenedAt' | 'folder'>>): Promise<void> {
        const data = await this.load(projectId);
        if (!data) throw new Error('Project not found');

        const updatedData = { ...data, ...updates, lastModified: Date.now() };
        await this.save(projectId, updatedData);
    }

    async saveThumbnail(projectId: string, thumbnail: string): Promise<void> {
        if (!this.octokit || !this.authenticatedUser) return;

        // 1. Check if thumbnail has changed
        const hash = this.hashString(thumbnail);
        const lastHash = this.lastThumbnailHashes.get(projectId);

        if (lastHash === hash) {
            console.log(`[GitHubAdapter] Thumbnail unchanged for ${projectId}, skipping save`);
            return;
        }

        // 2. Clear any existing debounce timer for this project
        const existingTimer = this.thumbnailDebounceTimers.get(projectId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // 3. Return existing promise if save is already in progress
        const existingPromise = this.thumbnailSavePromises.get(projectId);
        if (existingPromise) {
            console.log(`[GitHubAdapter] Thumbnail save already in progress for ${projectId}, reusing promise`);
            return existingPromise;
        }

        // 4. Debounce: Wait 500ms before actually saving
        const savePromise = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(async () => {
                this.thumbnailDebounceTimers.delete(projectId);

                try {
                    this.lastThumbnailHashes.set(projectId, hash);
                    await this.performThumbnailSave(projectId, thumbnail);
                    this.thumbnailSavePromises.delete(projectId);
                    resolve();
                } catch (error) {
                    this.thumbnailSavePromises.delete(projectId);
                    reject(error);
                }
            }, 2000);

            this.thumbnailDebounceTimers.set(projectId, timer);
        });

        this.thumbnailSavePromises.set(projectId, savePromise);
        return savePromise;
    }

    private async performThumbnailSave(projectId: string, thumbnail: string): Promise<void> {
        if (!this.isAuthenticated() || !this.octokit || !this.authenticatedUser) {
            throw new Error('Not authenticated with GitHub');
        }

        const owner = this.currentOwner!;
        const repo = this.currentRepo!;
        const path = `hivecad/thumbnails/${projectId}.png`;

        const base64Data = thumbnail.includes(',') ? thumbnail.split(',')[1] : thumbnail;

        // State for SHA
        let sha: string | undefined;

        const fetchSha = async () => {
            try {
                const { data: fileData } = await this.octokit!.rest.repos.getContent({
                    owner,
                    repo,
                    path,
                    ref: this.currentBranchName,
                });
                if (!Array.isArray(fileData)) {
                    sha = fileData.sha;
                }
            } catch (error: any) {
                if (error.status !== 404) throw error;
                sha = undefined;
            }
        };

        await fetchSha();

        await this.retryOperation(
            async () => {
                await this.octokit!.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path,
                    message: `Update thumbnail for ${projectId}`,
                    content: base64Data,
                    sha,
                    branch: this.currentBranchName,
                });
            },
            async () => {
                await fetchSha();
            }
        );

        console.log(`[GitHubAdapter] Thumbnail saved for ${projectId}`);
    }

    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    async load(projectId: string, owner?: string, repo?: string, ref?: string): Promise<ProjectData | null> {
        if (!this.octokit) {
            throw new Error('Not connected to GitHub');
        }

        const targetOwner = owner || this.currentOwner;
        const targetRepo = repo || this.currentRepo;

        if (!targetOwner || !targetRepo) {
            throw new Error('Owner and repository must be specified or connected');
        }

        // Attempt 1: New Structure (projects/<id>/.hivecad/data.json)
        const newPath = `projects/${projectId}/.hivecad/data.json`;
        try {
            const { data: fileData } = await this.octokit.rest.repos.getContent({
                owner: targetOwner,
                repo: targetRepo,
                path: newPath,
                ref: ref || this.currentBranchName,
            });
            if ('content' in fileData) {
                const content = atob(fileData.content.replace(/\n/g, ''));
                return JSON.parse(content);
            }
        } catch (e) {
            // Fallback
        }

        // Attempt 2: Legacy Structure (hivecad/<id>.json)
        const legacyPath = `hivecad/${projectId}.json`;

        try {
            const { data: fileData } = await this.octokit.rest.repos.getContent({
                owner: targetOwner,
                repo: targetRepo,
                path: legacyPath,
                ref: ref || this.currentBranchName,
            });

            if ('content' in fileData) {
                const content = atob(fileData.content.replace(/\n/g, ''));
                return JSON.parse(content);
            }
            return null;
        } catch (error: any) {
            if (error.status === 404) return null;
            throw error;
        }
    }

    async listProjects(): Promise<ProjectData[]> {
        if (!this.octokit || !this.authenticatedUser) throw new Error('Not authenticated with GitHub');

        const owner = this.currentOwner!;
        const repo = this.currentRepo!;

        // 1. Try to read from central index first (FAST)
        try {
            const indexPath = 'hivecad/index.json';
            const { data: indexFileData } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: indexPath,
                ref: this.currentBranchName,
            });

            if (!Array.isArray(indexFileData) && 'content' in indexFileData) {
                const content = atob(indexFileData.content.replace(/\n/g, ''));
                const index = JSON.parse(content);
                console.log('[GitHubAdapter] Loaded projects from index.json');
                return index;
            }
        } catch (error: any) {
            console.warn('[GitHubAdapter] Failed to read index.json, falling back to directory scan:', error.status);
            if (error.status === 404) {
                console.log('[GitHubAdapter] No index.json found - repository appears empty');
                return [];
            }
        }

        const projects: ProjectData[] = [];

        // 2. Scan Legacy 'hivecad/' folder
        try {
            const { data: contents } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: 'hivecad',
                ref: this.currentBranchName,
            });
            if (Array.isArray(contents)) {
                const legacyProjects = contents
                    .filter(item => item.name.endsWith('.json') && item.name !== 'index.json' && item.name !== 'tags.json' && item.name !== 'folders.json')
                    .map(item => ({
                        id: item.name.replace('.json', ''),
                        name: item.name.replace('.json', ''), // Fallback name
                        ownerId: owner,
                        lastModified: Date.now(),
                    })) as ProjectData[];
                projects.push(...legacyProjects);
            }
        } catch (error: any) {
            if (error.status !== 404) {
                console.warn('[GitHubAdapter] Failed to scan legacy hivecad directory:', error);
            }
        }

        // 3. Scan 'projects/' folder
        // This effectively lists directories in 'projects/'
        try {
            const { data: contents } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: 'projects',
                ref: this.currentBranchName,
            });

            if (Array.isArray(contents)) {

                const newProjects = contents
                    .filter(item => item.type === 'dir' && !item.name.startsWith('.'))
                    .map(item => ({
                        id: item.name,
                        name: item.name, // Will be corrected if index is present or when project is loaded
                        ownerId: owner,
                        lastModified: Date.now(),
                    })) as ProjectData[];

                // Deduplicate (prefer new structure if ID conflicts)
                projects.push(...newProjects);
            }
        } catch (error: any) {
            if (error.status !== 404) {
                console.warn('[GitHubAdapter] Failed to scan projects directory:', error);
            }
        }

        return projects;
    }

    async listTags(): Promise<Array<{ name: string, color: string }>> {
        if (!this.octokit) return [];
        const owner = this.currentOwner!;
        const repo = this.currentRepo!;

        try {
            const { data: tagFileData } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: 'hivecad/tags.json',
                ref: this.currentBranchName,
            });
            if (!Array.isArray(tagFileData) && 'content' in tagFileData) {
                const content = atob(tagFileData.content.replace(/\n/g, ''));
                return JSON.parse(content);
            }
            return [];
        } catch (error: any) {
            if (error.status === 404) return [];
            throw error;
        }
    }

    async saveTags(tags: Array<{ name: string, color: string }>): Promise<void> {
        if (!this.octokit) return;
        const owner = this.currentOwner!;
        const repo = this.currentRepo!;
        const tagPath = 'hivecad/tags.json';

        let sha: string | undefined;

        const fetchSha = async () => {
            try {
                const { data: tagFileData } = await this.octokit!.rest.repos.getContent({
                    owner,
                    repo,
                    path: tagPath,
                    ref: this.currentBranchName,
                });
                if (!Array.isArray(tagFileData)) sha = tagFileData.sha;
            } catch (error: any) {
                if (error.status !== 404) throw error;
                sha = undefined;
            }
        };

        await fetchSha();

        await this.retryOperation(
            async () => {
                await this.octokit!.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: tagPath,
                    message: 'Update tag definitions',
                    content: btoa(JSON.stringify(tags, null, 2)),
                    sha,
                    branch: this.currentBranchName,
                });
            },
            async () => {
                await fetchSha();
            }
        );
    }

    async listFolders(): Promise<Array<{ name: string, color: string }>> {
        if (!this.octokit) return [];
        const owner = this.currentOwner!;
        const repo = this.currentRepo!;

        try {
            const { data: folderFileData } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: '.hivecad/folders.json',
                ref: this.currentBranchName,
            });
            if (!Array.isArray(folderFileData) && 'content' in folderFileData) {
                const content = atob(folderFileData.content.replace(/\n/g, ''));
                return JSON.parse(content);
            }
            return [];
        } catch (error: any) {
            if (error.status === 404) return [];
            throw error;
        }
    }

    async saveFolders(folders: Array<{ name: string, color: string }>): Promise<void> {
        if (!this.octokit) return;
        const owner = this.currentOwner!;
        const repo = this.currentRepo!;
        const folderPath = '.hivecad/folders.json';

        let sha: string | undefined;

        const fetchSha = async () => {
            try {
                const { data: folderFileData } = await this.octokit!.rest.repos.getContent({
                    owner,
                    repo,
                    path: folderPath,
                    ref: this.currentBranchName,
                });
                if (!Array.isArray(folderFileData)) sha = folderFileData.sha;
            } catch (error: any) {
                if (error.status !== 404) throw error;
                sha = undefined;
            }
        };

        await fetchSha();

        await this.retryOperation(
            async () => {
                await this.octokit!.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: folderPath,
                    message: 'Update folder definitions',
                    content: btoa(JSON.stringify(folders, null, 2)),
                    sha,
                    branch: this.currentBranchName,
                });
            },
            async () => {
                await fetchSha();
            }
        );
    }

    async searchCommunityProjects(query: string): Promise<any[]> {
        try {
            let supabaseQuery = supabase
                .from('projects')
                .select('*')
                .eq('is_public', true);

            if (query) {
                supabaseQuery = supabaseQuery.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
            }

            const { data, error } = await supabaseQuery;

            if (error) throw error;

            return data.map(item => ({
                id: item.id,
                name: item.name,
                owner: item.github_owner,
                repo: item.github_repo,
                description: item.description,
                thumbnail: item.thumbnail_url,
            }));
        } catch (error) {
            console.error('[GitHubAdapter] Failed to search Supabase projects:', error);

            // Fallback to GitHub Search
            if (!this.octokit) return [];

            const q = `${query} topic:hivecad-project`;
            const { data } = await this.octokit.rest.search.repos({ q });

            return data.items.map(item => ({
                id: item.id,
                name: item.name,
                owner: item.owner.login,
                description: item.description,
                url: item.html_url,
            }));
        }
    }

    async resetRepository(): Promise<void> {
        if (!this.octokit || !this.authenticatedUser || !this.currentOwner || !this.currentRepo) {
            throw new Error('Not authenticated with GitHub');
        }

        const owner = this.currentOwner;
        const repo = this.currentRepo;

        console.log(`[GitHubAdapter] Resetting repository ${owner}/${repo}...`);

        try {
            await this.cleanDirectory('', owner, repo);
            console.log(`[GitHubAdapter] Repository ${owner}/${repo} reset successfully.`);
        } catch (error: any) {
            console.error('[GitHubAdapter] Failed to reset repository:', error);
            throw error;
        }
    }

    private async cleanDirectory(path: string, owner: string, repo: string): Promise<void> {
        if (!this.octokit) return;

        try {
            const { data: contents } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path,
            });

            if (Array.isArray(contents)) {
                for (const item of contents) {
                    if (item.type === 'file') {
                        await this.octokit.rest.repos.deleteFile({
                            owner,
                            repo,
                            path: item.path,
                            message: `Clean up ${item.path} for repo reset`,
                            sha: item.sha,
                        });
                        console.log(`[GitHubAdapter] Deleted file ${item.path}`);
                    } else if (item.type === 'dir') {
                        // Recursively clean directory
                        await this.cleanDirectory(item.path, owner, repo);
                    }
                }
            }
        } catch (error: any) {
            // If path not found (empty), that's fine
            if (error.status === 404) return;
            throw error;
        }
    }

    private async initializeRepository(): Promise<void> {
        if (!this.octokit || !this.authenticatedUser || !this.currentOwner || !this.currentRepo) return;

        const owner = this.currentOwner;
        const repo = this.currentRepo;

        console.log('[GitHubAdapter] Initializing repository...');

        // ✓ List of required files for a fully initialized repo
        const requiredFiles = [
            'hivecad/index.json',
            'hivecad/tags.json',
            '.hivecad/folders.json',
        ];

        const missingFiles: string[] = [];

        // ✓ Check each required file
        for (const filePath of requiredFiles) {
            try {
                await this.octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: filePath,
                    ref: this.currentBranchName,
                });
            } catch (error: any) {
                if (error.status === 404) {
                    missingFiles.push(filePath);
                } else {
                    // Network error or other issue - don't treat as missing
                    console.warn(`[GitHubAdapter] Error checking ${filePath}:`, error.status);
                }
            }
        }

        // ✓ If any files are missing, reinitialize
        if (missingFiles.length > 0) {
            console.log(`[GitHubAdapter] Missing files detected: ${missingFiles.join(', ')}`);
            console.log('[GitHubAdapter] Reinitializing repository...');
            await this.populateDefaultContent();
        } else {
            console.log('[GitHubAdapter] Repository fully initialized');
        }
    }

    private async populateDefaultContent(): Promise<void> {
        if (!this.octokit || !this.authenticatedUser) return;

        console.log('[GitHubAdapter] Populating default content...');

        const filesToCreate = [
            {
                path: 'hivecad/index.json',
                content: '[]',
                message: 'Initialize project index',
            },
            {
                path: 'hivecad/tags.json',
                content: '[]',
                message: 'Initialize tags',
            },
            {
                path: '.hivecad/folders.json',
                content: '[]',
                message: 'Initialize folders',
            },
            {
                path: 'hivecad/thumbnails/.gitkeep',
                content: '',
                message: 'Initialize thumbnails directory',
            },
        ];

        for (const file of filesToCreate) {
            try {
                console.log(`[GitHubAdapter] Creating ${file.path}...`);

                // ✓ Check if file already exists
                let sha: string | undefined;
                try {
                    const { data: existing } = await this.octokit.rest.repos.getContent({
                        owner: this.currentOwner!,
                        repo: this.currentRepo!,
                        path: file.path,
                        ref: this.currentBranchName,
                    });
                    if (!Array.isArray(existing) && 'sha' in existing) {
                        sha = existing.sha;
                        console.log(`[GitHubAdapter] ${file.path} already exists, skipping`);
                        continue; // Skip if already exists
                    }
                } catch (error: any) {
                    // 404 is expected for new files
                    if (error.status !== 404) throw error;
                }

                // ✓ Create the file
                await this.octokit.rest.repos.createOrUpdateFileContents({
                    owner: this.currentOwner!,
                    repo: this.currentRepo!,
                    path: file.path,
                    message: file.message,
                    content: btoa(file.content),
                    sha, // Will be undefined for new files
                    branch: this.currentBranchName,
                });

                console.log(`[GitHubAdapter] ✓ ${file.path} created`);
            } catch (error: any) {
                console.error(`[GitHubAdapter] Failed to create ${file.path}:`, error);
                // ✓ Don't throw - continue with other files
            }
        }

        console.log('[GitHubAdapter] Default content population complete');
    }
    async getHistory(projectId: string): Promise<CommitInfo[]> {
        if (!this.octokit || !this.currentOwner || !this.currentRepo) return [];

        try {
            // We want to see history relevant to this project file across all "interesting" branches.
            // But simple API limitation: listCommits takes ONE sha.
            // Strategy: Get commits for the current branch.
            // Ideally we'd merge histories from main + current branch, but let's start with current.
            const response = await this.octokit.request('GET /repos/{owner}/{repo}/commits', {
                owner: this.currentOwner,
                repo: this.currentRepo,
                path: `hivecad/${projectId}.json`,
                sha: this.currentBranchName,
                per_page: 50,
            });

            return response.data.map((commit: any) => ({
                hash: commit.sha,
                parents: commit.parents.map((p: any) => p.sha),
                author: {
                    name: commit.commit.author.name,
                    email: commit.commit.author.email,
                    date: commit.commit.author.date,
                },
                subject: commit.commit.message.split('\n')[0],
                body: commit.commit.message.split('\n').slice(1).join('\n'),
                refNames: [commit.sha === response.data[0].sha ? this.currentBranchName : ''] // Simplified ref tagging
            }));
        } catch (error) {
            console.error('[GitHubAdapter] Failed to get history:', error);
            return [];
        }
    }

    async createBranch(projectId: string, sourceSha: string, branchName: string): Promise<void> {
        if (!this.octokit || !this.currentOwner || !this.currentRepo) throw new Error('Not connected');

        // Convention: project/{projectId}/{branchName}
        // But user might just pass "fix-bug". 
        // Let's force the convention inside this method or assume caller handles it?
        // Plan said: "The UI will filter branches... We will assume a naming convention".
        // Let's prepend project ID if not present?? 
        // Actually, let's keep it simple: creating a branch creates it at the repo level.
        // We will prepend `project/${projectId}/` to keep namespace clean.

        const fullBranchName = branchName.startsWith('project/') ? branchName : `project/${projectId}/${branchName}`;
        const ref = `refs/heads/${fullBranchName}`;

        try {
            await this.octokit.rest.git.createRef({
                owner: this.currentOwner,
                repo: this.currentRepo,
                ref,
                sha: sourceSha,
            });
            console.log(`[GitHubAdapter] Created branch ${ref} at ${sourceSha}`);

            // Switch to it?
            // Usually separate step, but for convenience let's wait for caller to switch.
        } catch (error: any) {
            if (error.status === 422) {
                throw new Error(`Branch ${fullBranchName} already exists`);
            }
            throw error;
        }
    }

    async getBranches(projectId: string): Promise<BranchInfo[]> {
        if (!this.octokit || !this.currentOwner || !this.currentRepo) return [];

        try {
            const { data: branches } = await this.octokit.rest.repos.listBranches({
                owner: this.currentOwner,
                repo: this.currentRepo,
            });

            // Filter: main + project-specific branches
            const relevantBranches = branches.filter(b =>
                b.name === 'main' ||
                b.name === 'master' ||
                b.name.startsWith(`project/${projectId}/`)
            );

            return relevantBranches.map(b => ({
                name: b.name,
                sha: b.commit.sha,
                isCurrent: b.name === this.currentBranchName
            }));
        } catch (error) {
            console.error('[GitHubAdapter] Failed to list branches:', error);
            return [];
        }
    }

    async switchBranch(branchName: string): Promise<void> {
        // Just update local state.
        // In a real git client we'd checkout. 
        // Here we just say "future operations apply to this branch".
        // Verify branch exists?

        const exists = await this.ensureBranchExists(branchName);
        if (!exists) throw new Error(`Branch ${branchName} does not exist`);

        this.currentBranchName = branchName;
        console.log(`[GitHubAdapter] Switched to branch ${branchName}`);
    }

    async getCurrentBranch(): Promise<string> {
        return this.currentBranchName;
    }

    private async ensureBranchExists(branchName: string): Promise<boolean> {
        if (!this.octokit || !this.currentOwner || !this.currentRepo) return false;
        try {
            await this.octokit.rest.repos.getBranch({
                owner: this.currentOwner,
                repo: this.currentRepo,
                branch: branchName,
            });
            return true;
        } catch {
            return false;
        }
    }

    private async ensureRepoExists(owner: string, repo: string): Promise<void> {
        if (!this.octokit) throw new Error('Not connected');
        try {
            await this.octokit.rest.repos.get({
                owner,
                repo,
            });
        } catch (error: any) {
            throw new Error(`Repository ${owner}/${repo} does not exist or is not accessible.`);
        }
    }
}

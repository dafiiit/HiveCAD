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
    private settingsSaveLock: boolean = false;

    // Helper to safely encode UTF-8 strings to base64
    private utf8ToBase64(str: string): string {
        // Use TextEncoder to convert UTF-8 string to bytes, then base64 encode
        const bytes = new TextEncoder().encode(str);
        const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
        return btoa(binString);
    }

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

    private async commitTree(
        owner: string,
        repo: string,
        branch: string,
        message: string,
        files: Array<{ path: string; content: string }>
    ): Promise<void> {
        if (!this.octokit) throw new Error('Not authenticated');

        await this.retryOperation(
            async () => {
                // 1. Get the latest commit SHA for the branch
                const { data: refData } = await this.octokit!.rest.git.getRef({
                    owner,
                    repo,
                    ref: `heads/${branch}`,
                });
                const latestCommitSha = refData.object.sha;

                // 2. Get the tree SHA for the latest commit
                const { data: commitData } = await this.octokit!.rest.git.getCommit({
                    owner,
                    repo,
                    commit_sha: latestCommitSha,
                });
                const baseTreeSha = commitData.tree.sha;

                // 3. Create a new tree with the updated files
                const tree = files.map(file => ({
                    path: file.path,
                    mode: '100644' as const,
                    type: 'blob' as const,
                    content: file.content,
                }));

                const { data: newTreeData } = await this.octokit!.rest.git.createTree({
                    owner,
                    repo,
                    base_tree: baseTreeSha,
                    tree,
                });

                // 4. Create a new commit
                const { data: newCommitData } = await this.octokit!.rest.git.createCommit({
                    owner,
                    repo,
                    message,
                    tree: newTreeData.sha,
                    parents: [latestCommitSha],
                });

                // 5. Update the branch reference
                await this.octokit!.rest.git.updateRef({
                    owner,
                    repo,
                    ref: `heads/${branch}`,
                    sha: newCommitData.sha,
                    force: false,
                });
            },
            async () => {
                // No specific state to reset for git operations as we re-fetch everything from HEAD
            }
        );
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

        console.log(`[GitHubAdapter] Saving project ${projectId} to ${owner}/${repo} (Modular Storage)...`);

        // 1. Prepare Metadata
        const projectMetadata: Partial<ProjectData> = {
            id: projectId,
            name: data.name || data.fileName || projectId,
            ownerId: this.authenticatedUser,
            version: data.version || '1.0.0',
            lastModified: Date.now(),
            tags: data.tags || [],
            deletedAt: data.deletedAt,
            folder: data.folder,
        };

        // 2. Prepare CAD Data
        const cadData = {
            code: data.cad?.code || data.code || (data.files && data.files.code) || '',
            objects: data.cad?.objects || data.objects || (data.files && data.files.objects) || [],
        };

        // 3. Prepare Namespace/Extension Data
        const namespaces = data.namespaces || {};

        // 4. Construct File list for Git Tree
        const filesToCommit: Array<{ path: string; content: string }> = [
            {
                path: `projects/${projectId}/.hivecad/project.json`,
                content: JSON.stringify(projectMetadata, null, 2),
            },
            {
                path: `projects/${projectId}/.hivecad/cad/main.json`,
                content: JSON.stringify(cadData, null, 2),
            }
        ];

        // Add each namespace as a separate file
        Object.entries(namespaces).forEach(([namespace, namespaceData]) => {
            filesToCommit.push({
                path: `projects/${projectId}/.hivecad/extensions/${namespace}.json`,
                content: JSON.stringify(namespaceData, null, 2),
            });
        });

        // 5. Atomic Commit
        await this.commitTree(
            owner,
            repo,
            this.currentBranchName,
            `Update modular project ${projectId}`,
            filesToCommit
        );

        // 6. Update Index (Lite ProjectData for listing)
        const projectListData: ProjectData = {
            ...projectMetadata,
            id: projectId,
            name: projectMetadata.name!,
            ownerId: projectMetadata.ownerId!,
            version: projectMetadata.version!,
            lastModified: projectMetadata.lastModified!,
        };

        await this.updateIndex(projectId, projectListData);

        console.log(`[GitHubAdapter] Saved ${projectId} modularly to ${owner}/${repo}`);

        // Centralized Project Index (Supabase)
        try {
            const { error } = await supabase
                .from('projects')
                .upsert({
                    id: projectId,
                    name: projectListData.name,
                    description: (data as any).description || 'A HiveCAD Project',
                    thumbnail_url: `${import.meta.env.VITE_GITHUB_PAGES_URL || `https://raw.githubusercontent.com/${owner}/${repo}/main/`}hivecad/thumbnails/${projectId}.png`,
                    github_owner: owner,
                    github_repo: repo,
                    file_path: `projects/${projectId}/.hivecad/project.json`,
                    is_public: true,
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
        const targetRef = ref || this.currentBranchName;

        if (!targetOwner || !targetRepo) {
            throw new Error('Owner and repository must be specified or connected');
        }

        console.log(`[GitHubAdapter] Loading project ${projectId} from ${targetOwner}/${targetRepo}...`);

        // 1. Attempt Modular Load (projects/${id}/.hivecad/*)
        try {
            // First, get the tree to see what we have
            const { data: treeData } = await this.octokit.rest.git.getTree({
                owner: targetOwner,
                repo: targetRepo,
                tree_sha: targetRef,
                recursive: 'true',
            });

            const projectPrefix = `projects/${projectId}/.hivecad/`;
            const projectFiles = treeData.tree.filter(item => item.path?.startsWith(projectPrefix));

            if (projectFiles.length > 0) {
                console.log(`[GitHubAdapter] Found modular project structure for ${projectId}`);

                const project: Partial<ProjectData> = { id: projectId };
                const namespaces: Record<string, any> = {};

                // Fetch and process all files in parallel
                const filePromises = projectFiles.map(async (file) => {
                    try {
                        const relativePath = file.path!.replace(projectPrefix, '');
                        const { data: fileContent } = await this.octokit!.rest.repos.getContent({
                            owner: targetOwner,
                            repo: targetRepo,
                            path: file.path!,
                            ref: targetRef,
                        });

                        if ('content' in fileContent) {
                            return {
                                path: relativePath,
                                content: JSON.parse(atob(fileContent.content.replace(/\n/g, '')))
                            };
                        }
                    } catch (err) {
                        console.error(`[GitHubAdapter] Failed to load file ${file.path}:`, err);
                    }
                    return null;
                });

                const results = await Promise.all(filePromises);

                // Process results synchronously
                results.forEach(result => {
                    if (!result) return;

                    if (result.path === 'project.json') {
                        Object.assign(project, result.content);
                    } else if (result.path === 'cad/main.json') {
                        project.cad = result.content;
                    } else if (result.path.startsWith('extensions/')) {
                        const namespace = result.path.replace('extensions/', '').replace('.json', '');
                        namespaces[namespace] = result.content;
                    }
                });
                project.namespaces = namespaces;
                return project as ProjectData;
            }
        } catch (e) {
            console.warn('[GitHubAdapter] Modular load failed or not found, trying legacy...', e);
        }

        // 2. Attempt 1st Legacy Structure (projects/<id>/.hivecad/data.json)
        const legacyPath1 = `projects/${projectId}/.hivecad/data.json`;
        try {
            const { data: fileData } = await this.octokit.rest.repos.getContent({
                owner: targetOwner,
                repo: targetRepo,
                path: legacyPath1,
                ref: targetRef,
            });
            if ('content' in fileData) {
                const content = atob(fileData.content.replace(/\n/g, ''));
                return JSON.parse(content);
            }
        } catch (e) { }

        // 3. Attempt 2nd Legacy Structure (hivecad/<id>.json)
        const legacyPath2 = `hivecad/${projectId}.json`;
        try {
            const { data: fileData } = await this.octokit.rest.repos.getContent({
                owner: targetOwner,
                repo: targetRepo,
                path: legacyPath2,
                ref: targetRef,
            });

            if ('content' in fileData) {
                const content = atob(fileData.content.replace(/\n/g, ''));
                return JSON.parse(content);
            }
        } catch (error: any) {
            if (error.status === 404) return null;
            throw error;
        }

        return null;
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

    async searchCommunityExtensions(query: string): Promise<any[]> {
        try {
            // Get current user's email from Supabase auth session
            const { data: { session } } = await supabase.auth.getSession();
            const currentUserEmail = session?.user?.email || null;

            console.log('[GitHubAdapter] searchCommunityExtensions called');
            console.log('[GitHubAdapter] Current user email:', currentUserEmail);
            console.log('[GitHubAdapter] Search query:', query);

            // Fetch published extensions OR extensions created by the current user
            let supabaseQuery = supabase
                .from('extensions')
                .select('*');

            // Filter: published extensions OR user's own extensions (any status)
            if (currentUserEmail) {
                supabaseQuery = supabaseQuery.or(`status.eq.published,author.eq.${currentUserEmail}`);
            } else {
                supabaseQuery = supabaseQuery.eq('status', 'published');
            }

            const { data, error } = await supabaseQuery;

            if (error) throw error;

            console.log(`[GitHubAdapter] Found ${data.length} extension(s) in Supabase`);
            data.forEach(item => {
                console.log(`  - ${item.id} (author: ${item.author}, status: ${item.status}, repo: ${item.github_owner}/${item.github_repo})`);
            });

            // Fetch manifest for each extension from GitHub
            if (!this.octokit) {
                console.warn('[GitHubAdapter] Not authenticated, cannot fetch manifests');
                return [];
            }

            const extensionsWithManifests = await Promise.all(
                data.map(async (item) => {
                    try {
                        // Determine the ref (branch) to use
                        // If looking at our own repository, use the current active branch to ensure we see WIP extensions
                        // Otherwise, rely on the repository's default branch
                        const isCurrentRepo = this.currentOwner && this.currentRepo &&
                            item.github_owner === this.currentOwner &&
                            item.github_repo === this.currentRepo;

                        const ref = isCurrentRepo ? this.currentBranchName : undefined;

                        // Fetch manifest.json from GitHub
                        const { data: manifestFileData } = await this.octokit!.rest.repos.getContent({
                            owner: item.github_owner,
                            repo: item.github_repo,
                            path: `extensions/${item.id}/manifest.json`,
                            ref,
                        });

                        if ('content' in manifestFileData) {
                            const manifestContent = atob(manifestFileData.content);
                            const manifest = JSON.parse(manifestContent);

                            // Filter by query if provided
                            if (query && !manifest.name.toLowerCase().includes(query.toLowerCase()) &&
                                !manifest.description.toLowerCase().includes(query.toLowerCase())) {
                                return null;
                            }

                            return {
                                id: item.id,
                                github_owner: item.github_owner,
                                github_repo: item.github_repo,
                                author: item.author,
                                status: item.status,
                                stats: {
                                    downloads: item.downloads || 0,
                                    likes: item.likes || 0,
                                    dislikes: item.dislikes || 0,
                                },
                                manifest,
                            };
                        }
                    } catch (error: any) {
                        console.warn(`[GitHubAdapter] Failed to load manifest for ${item.id}:`, error.message);
                        // Return a placeholder so the extension is visible (and deletable/debuggable)
                        return {
                            id: item.id,
                            github_owner: item.github_owner,
                            github_repo: item.github_repo,
                            author: item.author,
                            status: item.status,
                            stats: {
                                downloads: item.downloads || 0,
                                likes: item.likes || 0,
                                dislikes: item.dislikes || 0,
                            },
                            manifest: {
                                id: item.id,
                                name: `${item.id} (Load Failed)`,
                                description: `Failed to load manifest from ${item.github_owner}/${item.github_repo}. The extension files may be missing or on a different branch.`,
                                author: item.author,
                                version: '0.0.0',
                                icon: 'alert-circle',
                            },
                        };
                    }
                    return null;
                })
            );

            return extensionsWithManifests.filter(ext => ext !== null);
        } catch (error) {
            console.error('[GitHubAdapter] Failed to search Supabase extensions:', error);
            return [];
        }
    }

    async submitExtension(extension: any): Promise<string> {
        if (!this.octokit || !this.currentOwner || !this.currentRepo) {
            throw new Error('Not authenticated with GitHub');
        }

        const owner = this.currentOwner;
        const repo = this.currentRepo;
        const extensionId = extension.id;

        console.log(`[GitHubAdapter] Creating extension folder for ${extensionId}...`);

        // Create manifest.json
        const manifest = {
            id: extensionId,
            name: extension.name,
            description: extension.description,
            author: extension.author,
            version: extension.version || '1.0.0',
            icon: extension.icon,
        };

        // Create README.md
        const readme = `# ${extension.name}\n\n${extension.description}\n\n## Installation\nThis extension is part of the HiveCAD community library.\n\n## Usage\n[Add usage instructions here]\n\n## Author\n${extension.author}\n\n## Version\n${extension.version || '1.0.0'}\n`;

        // Create template index.ts
        const indexTs = `// ${extension.name}\n// ${extension.description}\n\nimport { Extension } from '@/lib/extensions/Extension';\n\nexport const extension: Extension = {\n    manifest: {\n        id: '${extensionId}',\n        name: '${extension.name}',\n        version: '${extension.version || '1.0.0'}',\n        description: '${extension.description}',\n        author: '${extension.author}',\n        icon: '${extension.icon}',\n        category: 'modifier',\n    },\n    onRegister: () => {\n        console.log('${extension.name} registered');\n    },\n};\n`;

        // Load EXTENSION_GUIDE.md content
        const guideResponse = await fetch('/src/extensions/EXTENSION_GUIDE.md');
        const guideContent = await guideResponse.text();

        try {
            // Create files in GitHub
            const files = [
                {
                    path: `extensions/${extensionId}/manifest.json`,
                    content: this.utf8ToBase64(JSON.stringify(manifest, null, 2)),
                    message: `Create manifest for ${extension.name}`,
                },
                {
                    path: `extensions/${extensionId}/README.md`,
                    content: this.utf8ToBase64(readme),
                    message: `Create README for ${extension.name}`,
                },
                {
                    path: `extensions/${extensionId}/index.ts`,
                    content: this.utf8ToBase64(indexTs),
                    message: `Create template for ${extension.name}`,
                },
                {
                    path: `extensions/${extensionId}/EXTENSION_GUIDE.md`,
                    content: this.utf8ToBase64(guideContent),
                    message: `Add development guide for ${extension.name}`,
                },
            ];

            for (const file of files) {
                await this.octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: file.path,
                    message: file.message,
                    content: file.content,
                    branch: this.currentBranchName,
                });
            }

            // Store reference in Supabase (not the content)
            const { error } = await supabase
                .from('extensions')
                .upsert({
                    id: extensionId,
                    github_owner: owner,
                    github_repo: repo,
                    author: extension.author,
                    status: 'development',
                    updated_at: new Date().toISOString(),
                });

            if (error) throw error;

            console.log(`[GitHubAdapter] Extension ${extension.name} created successfully`);

            // Return GitHub URL
            return `https://github.com/${owner}/${repo}/tree/${this.currentBranchName}/extensions/${extensionId}`;

        } catch (error) {
            console.error('[GitHubAdapter] Failed to create extension:', error);
            throw error;
        }
    }

    async updateExtensionStatus(extensionId: string, status: 'development' | 'published'): Promise<void> {
        try {
            const { error } = await supabase
                .from('extensions')
                .update({ status, updated_at: new Date().toISOString() })
                .eq('id', extensionId);

            if (error) throw error;
            console.log(`[GitHubAdapter] Extension ${extensionId} status updated to ${status}`);
        } catch (error) {
            console.error('[GitHubAdapter] Failed to update extension status:', error);
            throw error;
        }
    }

    async voteExtension(extensionId: string, voteType: 'like' | 'dislike'): Promise<void> {
        try {
            // First, get the current stats
            const { data: extension, error: fetchError } = await supabase
                .from('extensions')
                .select('likes, dislikes')
                .eq('id', extensionId)
                .single();

            if (fetchError) throw fetchError;

            // Increment the appropriate counter
            const updates = voteType === 'like'
                ? { likes: (extension.likes || 0) + 1 }
                : { dislikes: (extension.dislikes || 0) + 1 };

            const { error: updateError } = await supabase
                .from('extensions')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', extensionId);

            if (updateError) throw updateError;
            console.log(`[GitHubAdapter] Extension ${extensionId} ${voteType}d`);
        } catch (error) {
            console.error(`[GitHubAdapter] Failed to ${voteType} extension:`, error);
            throw error;
        }
    }

    async incrementExtensionDownloads(extensionId: string): Promise<void> {
        try {
            // First, get the current download count
            const { data: extension, error: fetchError } = await supabase
                .from('extensions')
                .select('downloads')
                .eq('id', extensionId)
                .single();

            if (fetchError) throw fetchError;

            // Increment downloads
            const { error: updateError } = await supabase
                .from('extensions')
                .update({
                    downloads: (extension.downloads || 0) + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', extensionId);

            if (updateError) throw updateError;
            console.log(`[GitHubAdapter] Extension ${extensionId} download count incremented`);
        } catch (error) {
            console.error('[GitHubAdapter] Failed to increment downloads:', error);
            throw error;
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
            'settings/ui.json',
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
            {
                path: 'settings/ui.json',
                content: '{}',
                message: 'Initialize user settings',
            },
        ];

        for (const file of filesToCreate) {
            try {
                console.log(`[GitHubAdapter] Checking/Creating ${file.path}...`);

                // ✓ Check if file already exists in default branch or current branch
                let sha: string | undefined;
                try {
                    const { data: existing } = await this.octokit.rest.repos.getContent({
                        owner: this.currentOwner!,
                        repo: this.currentRepo!,
                        path: file.path,
                        // Don't specify ref here to check the default branch first
                    });
                    if (!Array.isArray(existing) && 'sha' in existing) {
                        console.log(`[GitHubAdapter] ${file.path} already exists, skipping initialization`);
                        continue;
                    }
                } catch (error: any) {
                    if (error.status !== 404) {
                        console.warn(`[GitHubAdapter] Note: Error checking for ${file.path}:`, error.status);
                    }
                }

                // ✓ Create the file
                const content = btoa(file.content);
                await this.octokit.rest.repos.createOrUpdateFileContents({
                    owner: this.currentOwner!,
                    repo: this.currentRepo!,
                    path: file.path,
                    message: file.message,
                    content,
                    branch: this.currentBranchName,
                });

                console.log(`[GitHubAdapter] ✓ ${file.path} created`);
            } catch (error: any) {
                // If we get a "sha" error, it means it somehow does exist now (race condition or branch issue)
                if (error.message?.includes('"sha" wasn\'t supplied') || error.status === 409) {
                    console.log(`[GitHubAdapter] ${file.path} already exists (detected during creation), skipping`);
                    continue;
                }
                console.error(`[GitHubAdapter] Failed to create ${file.path}:`, error);
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

    async createIssue(title: string, body: string): Promise<void> {
        if (!this.octokit) {
            throw new Error('Not authenticated with GitHub');
        }

        // Feedback goes to the main HiveCAD repository
        const feedbackOwner = 'dafiiit';
        const feedbackRepo = 'HiveCAD';

        try {
            console.log(`[GitHubAdapter] Creating issue on ${feedbackOwner}/${feedbackRepo}...`);
            await this.octokit.rest.issues.create({
                owner: feedbackOwner,
                repo: feedbackRepo,
                title,
                body,
                labels: ['feedback']
            });
            console.log(`[GitHubAdapter] Issue created successfully.`);
        } catch (error: any) {
            console.error('[GitHubAdapter] Failed to create issue:', error);
            throw new Error(`Failed to submit feedback: ${error.message || String(error)}`);
        }
    }

    async saveUserSettings(data: any): Promise<void> {
        if (!this.octokit || !this.currentOwner || !this.currentRepo) return;
        if (this.settingsSaveLock) {
            console.log('[GitHubAdapter] Settings save already in progress, skipping...');
            return;
        }

        this.settingsSaveLock = true;
        console.log('[GitHubAdapter] Saving user settings...');
        const path = 'settings/ui.json';
        const owner = this.currentOwner;
        const repo = this.currentRepo;

        const fetchSha = async () => {
            try {
                const { data: existing } = await this.octokit!.rest.repos.getContent({
                    owner,
                    repo,
                    path,
                    ref: this.currentBranchName,
                    headers: { 'If-None-Match': '' } // bypass cache
                });
                if (!Array.isArray(existing) && 'sha' in existing) {
                    return existing.sha;
                }
            } catch (e: any) {
                if (e.status !== 404) throw e;
            }
            return undefined;
        };

        try {
            let currentSha = await fetchSha();

            await this.retryOperation(
                async () => {
                    await this.octokit!.rest.repos.createOrUpdateFileContents({
                        owner,
                        repo,
                        path,
                        message: 'Update user UI settings',
                        content: btoa(JSON.stringify(data, null, 2)),
                        sha: currentSha,
                        branch: this.currentBranchName,
                    });
                },
                async () => {
                    currentSha = await fetchSha();
                }
            );
            console.log('[GitHubAdapter] User settings saved successfully');
        } catch (error) {
            console.error('[GitHubAdapter] Failed to save user settings:', error);
            throw error;
        } finally {
            this.settingsSaveLock = false;
        }
    }

    async loadUserSettings(): Promise<any> {
        if (!this.octokit || !this.currentOwner || !this.currentRepo) return null;

        console.log('[GitHubAdapter] Loading user settings...');
        const path = 'settings/ui.json';

        try {
            const { data: fileData } = await this.octokit.rest.repos.getContent({
                owner: this.currentOwner,
                repo: this.currentRepo,
                path,
                ref: this.currentBranchName,
            });

            if ('content' in fileData) {
                const content = atob(fileData.content.replace(/\n/g, ''));
                return JSON.parse(content);
            }
        } catch (error: any) {
            if (error.status === 404) {
                console.log('[GitHubAdapter] User settings not found, using defaults');
                return null;
            }
            console.error('[GitHubAdapter] Failed to load user settings:', error);
        }
        return null;
    }
}

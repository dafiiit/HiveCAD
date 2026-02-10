import { Octokit } from 'octokit';
import { StorageAdapter, StorageType, ProjectData, CommitInfo, BranchInfo } from '../types';
import { supabase } from '../../auth/supabase';
import { hashString, retryOperation } from './github/GitHubHelpers';
import { GitHubBranchService } from './github/GitHubBranchService';
import { GitHubExtensionService } from './github/GitHubExtensionService';
import { GitHubRepoService } from './github/GitHubRepoService';
import { GitHubSettingsService } from './github/GitHubSettingsService';

/**
 * GitHub-backed storage adapter for HiveCAD projects.
 *
 * Core CRUD operations (save, load, delete, list, rename, metadata, thumbnails,
 * tags, folders, community search) remain in this file.
 *
 * Delegated responsibilities:
 *  - Branch & history ➜ GitHubBranchService
 *  - Extensions marketplace ➜ GitHubExtensionService
 *  - Repository init/reset ➜ GitHubRepoService
 *  - User settings ➜ GitHubSettingsService
 */
export class GitHubAdapter implements StorageAdapter {
    readonly type: StorageType = 'github';
    readonly name: string = 'GitHub';

    // --- Internal state ---
    private _isAuthenticated: boolean = false;
    private octokit: Octokit | null = null;
    private authenticatedUser: string | null = null;
    private currentOwner: string | null = null;
    private currentRepo: string | null = null;
    private currentBranchName: string = 'main';

    // Thumbnail deduplication & debouncing
    private thumbnailSavePromises: Map<string, Promise<void>> = new Map();
    private thumbnailDebounceTimers: Map<string, any> = new Map();
    private lastThumbnailHashes: Map<string, string> = new Map();

    // --- Delegate services ---
    private branchService!: GitHubBranchService;
    private extensionService!: GitHubExtensionService;
    private repoService!: GitHubRepoService;
    private settingsService!: GitHubSettingsService;

    /** (Re-)initialise all delegate services after state changes. */
    private initServices(): void {
        const getOctokit = () => this.octokit;
        const getOwner = () => this.currentOwner;
        const getRepo = () => this.currentRepo;
        const getBranch = () => this.currentBranchName;

        this.branchService = new GitHubBranchService(
            getOctokit, getOwner, getRepo, getBranch,
            (b) => { this.currentBranchName = b; }
        );
        this.extensionService = new GitHubExtensionService(
            getOctokit, getOwner, getRepo, getBranch
        );
        this.repoService = new GitHubRepoService(
            getOctokit, getOwner, getRepo, getBranch,
            () => this.authenticatedUser
        );
        this.settingsService = new GitHubSettingsService(
            getOctokit, getOwner, getRepo, getBranch
        );
    }

    // =====================================================================
    // Authentication
    // =====================================================================

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
                userAgent: 'HiveCAD v1.0'
            });

            console.log('[GitHubAdapter] Fetching authenticated user...');
            const { data: user } = await this.octokit.rest.users.getAuthenticated();
            console.log('[GitHubAdapter] Authenticated as:', user.login);

            this.authenticatedUser = user.login;
            this.currentOwner = user.login;
            this.currentRepo = 'hivecad-projects';

            this._isAuthenticated = true;
            console.log(`[GitHubAdapter] Connected as ${this.authenticatedUser}`);

            this.initServices();

            // Initialize repository (ensure exists, set visibility, etc.)
            await this.repoService.initializeRepository();

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

    // =====================================================================
    // Git Tree helpers (kept here – used by save / thumbnail / index)
    // =====================================================================

    private async commitTree(
        owner: string,
        repo: string,
        branch: string,
        message: string,
        files: Array<{ path: string; content: string }>
    ): Promise<void> {
        if (!this.octokit) throw new Error('Not authenticated');

        await retryOperation(
            async () => {
                const { data: refData } = await this.octokit!.rest.git.getRef({
                    owner,
                    repo,
                    ref: `heads/${branch}`,
                });
                const latestCommitSha = refData.object.sha;

                const { data: commitData } = await this.octokit!.rest.git.getCommit({
                    owner,
                    repo,
                    commit_sha: latestCommitSha,
                });
                const baseTreeSha = commitData.tree.sha;

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

                const { data: newCommitData } = await this.octokit!.rest.git.createCommit({
                    owner,
                    repo,
                    message,
                    tree: newTreeData.sha,
                    parents: [latestCommitSha],
                });

                await this.octokit!.rest.git.updateRef({
                    owner,
                    repo,
                    ref: `heads/${branch}`,
                    sha: newCommitData.sha,
                    force: false,
                });
            },
            async () => {
                // No specific state to reset for git operations
            }
        );
    }

    // =====================================================================
    // Core CRUD
    // =====================================================================

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
            description: data.description,
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

        // 6. Update Index
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
                    description: projectListData.description || 'A HiveCAD Project',
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

        await retryOperation(
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

                const existingIndex = index.findIndex(p => p.id === projectId);
                if (isDelete) {
                    if (existingIndex > -1) index.splice(existingIndex, 1);
                } else {
                    const existingEntry = existingIndex > -1 ? index[existingIndex] : { id: projectId } as ProjectData;
                    const entry = { ...existingEntry, ...updates };
                    delete (entry as any).files;
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

            await retryOperation(
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
        try {
            await deleteFileWithRetry(`projects/${projectId}/.hivecad/data.json`, 'data file');
        } catch (error: any) {
            if (error.status !== 404) console.warn(`[GitHubAdapter] Unexpected error deleting data file:`, error);
        }

        // 2. Delete legacy data file if exists
        try {
            await deleteFileWithRetry(`hivecad/${projectId}.json`, 'legacy file');
        } catch (error: any) {
            if (error.status !== 404) console.warn(`[GitHubAdapter] Unexpected error deleting legacy file:`, error);
        }

        // 3. Delete thumbnail
        try {
            await deleteFileWithRetry(`hivecad/thumbnails/${projectId}.png`, 'thumbnail');
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
        await this.updateMetadata(projectId, { name: newName });
    }

    async updateMetadata(projectId: string, updates: Partial<Pick<ProjectData, 'tags' | 'deletedAt' | 'name' | 'lastOpenedAt' | 'folder'>>): Promise<void> {
        const data = await this.load(projectId);
        if (!data) throw new Error('Project not found');
        const updatedData = { ...data, ...updates, lastModified: Date.now() };
        await this.save(projectId, updatedData);
    }

    // =====================================================================
    // Thumbnails
    // =====================================================================

    async saveThumbnail(projectId: string, thumbnail: string): Promise<void> {
        if (!this.octokit || !this.authenticatedUser) return;

        const hash = hashString(thumbnail);
        const lastHash = this.lastThumbnailHashes.get(projectId);

        if (lastHash === hash) {
            console.log(`[GitHubAdapter] Thumbnail unchanged for ${projectId}, skipping save`);
            return;
        }

        const existingTimer = this.thumbnailDebounceTimers.get(projectId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const existingPromise = this.thumbnailSavePromises.get(projectId);
        if (existingPromise) {
            console.log(`[GitHubAdapter] Thumbnail save already in progress for ${projectId}, reusing promise`);
            return existingPromise;
        }

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

        await retryOperation(
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

    // =====================================================================
    // Load
    // =====================================================================

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

        // 2. Attempt 1st Legacy Structure
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

        // 3. Attempt 2nd Legacy Structure
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

    // =====================================================================
    // List Projects
    // =====================================================================

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
                        name: item.name.replace('.json', ''),
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
                        name: item.name,
                        ownerId: owner,
                        lastModified: Date.now(),
                    })) as ProjectData[];

                projects.push(...newProjects);
            }
        } catch (error: any) {
            if (error.status !== 404) {
                console.warn('[GitHubAdapter] Failed to scan projects directory:', error);
            }
        }

        return projects;
    }

    // =====================================================================
    // Tags & Folders
    // =====================================================================

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

        await retryOperation(
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

        await retryOperation(
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

    // =====================================================================
    // Community Search
    // =====================================================================

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

    // =====================================================================
    // Delegated: Extensions
    // =====================================================================

    async searchCommunityExtensions(query: string): Promise<any[]> {
        return this.extensionService.searchCommunityExtensions(query);
    }

    async submitExtension(extension: any): Promise<string> {
        return this.extensionService.submitExtension(extension);
    }

    async updateExtensionStatus(extensionId: string, status: 'development' | 'published'): Promise<void> {
        return this.extensionService.updateExtensionStatus(extensionId, status);
    }

    async voteExtension(extensionId: string, voteType: 'like' | 'dislike'): Promise<void> {
        return this.extensionService.voteExtension(extensionId, voteType);
    }

    async incrementExtensionDownloads(extensionId: string): Promise<void> {
        return this.extensionService.incrementExtensionDownloads(extensionId);
    }

    // =====================================================================
    // Delegated: Repository Management
    // =====================================================================

    async resetRepository(): Promise<void> {
        return this.repoService.resetRepository();
    }

    async createIssue(title: string, body: string): Promise<void> {
        return this.repoService.createIssue(title, body);
    }

    // =====================================================================
    // Delegated: Branch & History
    // =====================================================================

    async getHistory(projectId: string): Promise<CommitInfo[]> {
        return this.branchService.getHistory(projectId);
    }

    async createBranch(projectId: string, sourceSha: string, branchName: string): Promise<void> {
        return this.branchService.createBranch(projectId, sourceSha, branchName);
    }

    async getBranches(projectId: string): Promise<BranchInfo[]> {
        return this.branchService.getBranches(projectId);
    }

    async switchBranch(branchName: string): Promise<void> {
        return this.branchService.switchBranch(branchName);
    }

    async getCurrentBranch(): Promise<string> {
        return this.branchService.getCurrentBranch();
    }

    // =====================================================================
    // Delegated: User Settings
    // =====================================================================

    async saveUserSettings(data: any): Promise<void> {
        return this.settingsService.saveUserSettings(data);
    }

    async loadUserSettings(): Promise<any> {
        return this.settingsService.loadUserSettings();
    }
}

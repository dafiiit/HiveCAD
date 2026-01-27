import { Octokit } from 'octokit';
import { StorageAdapter, StorageType, ProjectData, CommitInfo, BranchInfo } from '../types';
import { supabase } from '../../auth/supabase';

export class GitHubAdapter implements StorageAdapter {
    readonly type: StorageType = 'github';
    readonly name: string = 'GitHub';
    private _isAuthenticated: boolean = false;
    private octokit: Octokit | null = null;
    private authenticatedUser: string | null = null;
    private currentOwner: string | null = null;
    private currentRepo: string | null = null;
    private currentBranchName: string = 'main';

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
                    // Add a small jitter/delay to prevent hammering
                    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
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

        await this.ensureRepoExists(owner, repo);

        // Ensure repository is public and has the correct topic
        try {
            await this.octokit.rest.repos.update({
                owner,
                repo,
                private: false,
                description: 'HiveCAD Projects (Decentralized Storage)',
            });
        } catch (error) {
            console.warn('[GitHubAdapter] Failed to update repository visibility:', error);
        }

        // New Path Structure: projects/<id>/.hivecad/data.json
        // We will move away from hivecad/<id>.json to support "Directory per Project"
        const path = `projects/${projectId}/.hivecad/data.json`;

        // Prepare data with metadata if not present
        const projectData: ProjectData = {
            id: projectId,
            name: data.name || projectId,
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
            await this.updateIndex(projectData);
        } else {
            console.log(`[GitHubAdapter] Metadata unchanged for ${projectId}, skipping index update.`);
        }

        // Ensure topic is present (idempotent)
        await this.octokit.rest.repos.replaceAllTopics({
            owner,
            repo,
            names: ['hivecad-project'],
        });

        console.log(`[GitHubAdapter] Saved ${projectId} to ${owner}/${repo}`);

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

    private async updateIndex(project: ProjectData, isDelete = false): Promise<void> {
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
                const existingIndex = index.findIndex(p => p.id === project.id);
                if (isDelete) {
                    if (existingIndex > -1) index.splice(existingIndex, 1);
                } else {
                    const entry = { ...project };
                    delete entry.files; // Don't store full data in index
                    if (existingIndex > -1) {
                        index[existingIndex] = entry;
                    } else {
                        index.push(entry);
                    }
                }

                await this.octokit!.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: indexPath,
                    message: isDelete ? `Remove ${project.id} from index` : `Update ${project.id} in index`,
                    content: btoa(JSON.stringify(index, null, 2)),
                    sha,
                    branch: this.currentBranchName,
                });
            },
            async () => {
                // No specific state needed to refresh here as we re-fetch everything inside the loop
            }
        );
    }

    async delete(projectId: string): Promise<void> {
        // Soft delete: update deletedAt
        await this.updateMetadata(projectId, { deletedAt: Date.now() });
    }

    async rename(projectId: string, newName: string): Promise<void> {
        await this.updateMetadata(projectId, { name: newName });
    }

    async updateMetadata(projectId: string, updates: Partial<Pick<ProjectData, 'tags' | 'deletedAt' | 'name' | 'lastOpenedAt' | 'folder'>>): Promise<void> {
        const data = await this.load(projectId);
        if (!data) throw new Error('Project not found');

        const updatedData = { ...data, ...updates, lastModified: Date.now() };
        await this.save(projectId, updatedData);
    }

    async saveThumbnail(projectId: string, thumbnail: string): Promise<void> {
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
        const projects: ProjectData[] = [];

        // 1. Scan Legacy 'hivecad/' folder
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
            // Ignore 404
        }

        // 2. Scan 'projects/' folder
        // This effectively lists directories in 'projects/'
        try {
            const { data: contents } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: 'projects',
                ref: this.currentBranchName,
            });

            if (Array.isArray(contents)) {
                // For each directory, we ideally want to fetch the data.json
                // But making N requests is slow.
                // For listing, maybe we just assume existence or store a central index.
                // For now, let's return minimal data derived from directory name.
                // Ideally listProjects should fetch the index if available.
                // But since we are moving away from central index, let's just list the folders.
                const newProjects = contents
                    .filter(item => item.type === 'dir')
                    .map(item => ({
                        id: item.name,
                        name: item.name, // Will be updated when loaded or if we fetch metadata
                        ownerId: owner,
                        lastModified: Date.now(),
                        // Marking as 'Partial' load might be good, but ProjectData doesn't support it yet.
                        // The dashboard will load the full project when opened?
                        // Actually, dashboard expects full data (tags, thumbnails).
                        // If we don't have it, we might display placeholders.
                        // Or we can fetch 'projects/<id>/.hivecad/data.json' in parallel (limited batch).
                        // Let's rely on the dashboard to handle this or improve this later.
                        // Actually, 'listProjects' contract usually returns full metadata.
                        // Let's start with basic info derived from folder name.
                    })) as ProjectData[];

                // Deduplicate (prefer new structure if ID conflicts - unlikely with UUIDs but possible if migrated manually)
                projects.push(...newProjects);
            }
        } catch (error) {
            // Ignore 404
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

        try {
            console.log(`[GitHubAdapter] Resetting repository ${owner}/${repo}...`);

            // List all files in the hivecad/ directory
            const { data: contents } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: 'hivecad',
            });

            if (Array.isArray(contents)) {
                // Delete each file
                // Delete each file/directory
                for (const item of contents) {
                    if (item.type === 'file') {
                        await this.octokit.rest.repos.deleteFile({
                            owner,
                            repo,
                            path: item.path,
                            message: `Clean up ${item.path} for repo reset`,
                            sha: item.sha,
                        });
                        console.log(`[GitHubAdapter] Deleted ${item.path}`);
                    } else if (item.type === 'dir') {
                        // Recursively delete contents of directory (e.g. thumbnails)
                        try {
                            const { data: dirContents } = await this.octokit.rest.repos.getContent({
                                owner,
                                repo,
                                path: item.path,
                            });

                            if (Array.isArray(dirContents)) {
                                for (const subItem of dirContents) {
                                    if (subItem.type === 'file') {
                                        await this.octokit.rest.repos.deleteFile({
                                            owner,
                                            repo,
                                            path: subItem.path,
                                            message: `Clean up ${subItem.path} for repo reset`,
                                            sha: subItem.sha,
                                        });
                                        console.log(`[GitHubAdapter] Deleted ${subItem.path}`);
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn(`[GitHubAdapter] Failed to clean up directory ${item.path}`, err);
                        }
                    }
                }
            }

            console.log(`[GitHubAdapter] Repository ${owner}/${repo} reset successfully.`);
        } catch (error: any) {
            if (error.status === 404) {
                console.log('[GitHubAdapter] hivecad/ directory not found, nothing to reset.');
                return;
            }
            console.error('[GitHubAdapter] Failed to reset repository:', error);
            throw error;
        }
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

import { Octokit } from 'octokit';
import { StorageAdapter, StorageType, ProjectData } from '../types';

export class GitHubAdapter implements StorageAdapter {
    readonly type: StorageType = 'github';
    readonly name: string = 'GitHub';
    private _isAuthenticated: boolean = false;
    private octokit: Octokit | null = null;
    private authenticatedUser: string | null = null;
    private currentOwner: string | null = null;
    private currentRepo: string | null = null;

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

    private async ensureRepoExists(owner: string, repo: string): Promise<boolean> {
        if (!this.octokit) return false;

        try {
            await this.octokit.rest.repos.get({ owner, repo });
            return true;
        } catch (error: any) {
            if (error.status === 404) {
                console.log(`[GitHubAdapter] Repository ${owner}/${repo} not found. Attempting to create...`);
                try {
                    await this.octokit.rest.repos.createForAuthenticatedUser({
                        name: repo,
                        description: 'HiveCAD Projects (Decentralized Storage)',
                        private: false,
                    });

                    // Add topic
                    await this.octokit.rest.repos.replaceAllTopics({
                        owner,
                        repo,
                        names: ['hivecad-project'],
                    });

                    console.log(`[GitHubAdapter] Repository ${owner}/${repo} created successfully.`);
                    return true;
                } catch (createError: any) {
                    console.error('[GitHubAdapter] Failed to create repository:', createError);
                    if (createError.status === 403 || createError.status === 401) {
                        throw new Error(`Failed to create repository '${repo}'. Your GitHub PAT might be missing the 'repo' scope.`);
                    }
                    throw createError;
                }
            }
            throw error;
        }
    }

    async save(projectId: string, data: any): Promise<void> {
        if (!this.isAuthenticated() || !this.octokit || !this.authenticatedUser) {
            throw new Error('Not authenticated with GitHub');
        }

        const owner = this.currentOwner;
        const repo = this.currentRepo;

        if (!owner) {
            throw new Error('GitHub owner is not defined. Please try reconnecting your account.');
        }
        if (!repo) {
            throw new Error('GitHub repository is not defined. Please try reconnecting your account.');
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

        const path = `hivecad/${projectId}.json`;

        // Prepare data with metadata if not present
        const projectData: ProjectData = {
            id: projectId,
            name: data.name || projectId,
            ownerId: this.authenticatedUser,
            files: data.files || data,
            version: data.version || '1.0.0',
            lastModified: Date.now(),
            labels: data.labels || [],
            deletedAt: data.deletedAt,
            thumbnail: data.thumbnail,
        };

        const content = btoa(JSON.stringify(projectData, null, 2));

        let sha: string | undefined;
        try {
            const { data: fileData } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path,
            });
            if (!Array.isArray(fileData)) {
                sha = fileData.sha;
            }
        } catch (error: any) {
            if (error.status !== 404) throw error;
        }

        await this.octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: `Update project ${projectId}`,
            content,
            sha,
        });

        // Update the central index
        await this.updateIndex(projectData);

        // Ensure topic is present (idempotent)
        await this.octokit.rest.repos.replaceAllTopics({
            owner,
            repo,
            names: ['hivecad-project'],
        });

        console.log(`[GitHubAdapter] Saved ${projectId} to ${owner}/${repo}`);
    }

    private async updateIndex(project: ProjectData, isDelete = false): Promise<void> {
        if (!this.octokit) return;
        const owner = this.currentOwner!;
        const repo = this.currentRepo!;
        const indexPath = 'hivecad/index.json';

        try {
            let index: ProjectData[] = [];
            let sha: string | undefined;

            try {
                const { data: indexFileData } = await this.octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: indexPath,
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

            await this.octokit.rest.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: indexPath,
                message: isDelete ? `Remove ${project.id} from index` : `Update ${project.id} in index`,
                content: btoa(JSON.stringify(index, null, 2)),
                sha,
            });
        } catch (error) {
            console.error('[GitHubAdapter] Failed to update index:', error);
        }
    }

    async delete(projectId: string): Promise<void> {
        // Soft delete: update deletedAt
        await this.updateMetadata(projectId, { deletedAt: Date.now() });
    }

    async rename(projectId: string, newName: string): Promise<void> {
        await this.updateMetadata(projectId, { name: newName });
    }

    async updateMetadata(projectId: string, updates: Partial<Pick<ProjectData, 'labels' | 'deletedAt' | 'name' | 'lastOpenedAt'>>): Promise<void> {
        const data = await this.load(projectId);
        if (!data) throw new Error('Project not found');

        const updatedData = { ...data, ...updates, lastModified: Date.now() };
        await this.save(projectId, updatedData);
    }

    async load(projectId: string, owner?: string, repo?: string): Promise<ProjectData | null> {
        if (!this.octokit) {
            throw new Error('Not connected to GitHub');
        }

        const targetOwner = owner || this.currentOwner;
        const targetRepo = repo || this.currentRepo;

        if (!targetOwner || !targetRepo) {
            throw new Error('Owner and repository must be specified or connected');
        }

        const path = `hivecad/${projectId}.json`;

        try {
            const { data: fileData } = await this.octokit.rest.repos.getContent({
                owner: targetOwner,
                repo: targetRepo,
                path,
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

        try {
            const { data: indexFileData } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: 'hivecad/index.json',
            });

            if (!Array.isArray(indexFileData) && 'content' in indexFileData) {
                const content = atob(indexFileData.content.replace(/\n/g, ''));
                return JSON.parse(content);
            }
            return [];
        } catch (error: any) {
            if (error.status === 404) {
                // Fallback: list files if index doesn't exist (legacy migration)
                const { data: contents } = await this.octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: 'hivecad',
                });
                if (Array.isArray(contents)) {
                    return contents
                        .filter(item => item.name.endsWith('.json') && item.name !== 'index.json' && item.name !== 'tags.json')
                        .map(item => ({
                            id: item.name.replace('.json', ''),
                            name: item.name.replace('.json', ''),
                            ownerId: owner,
                            lastModified: Date.now(),
                        })) as ProjectData[];
                }
            }
            return [];
        }
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
        try {
            const { data: tagFileData } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: tagPath,
            });
            if (!Array.isArray(tagFileData)) sha = tagFileData.sha;
        } catch (error: any) {
            if (error.status !== 404) throw error;
        }

        await this.octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: tagPath,
            message: 'Update tag definitions',
            content: btoa(JSON.stringify(tags, null, 2)),
            sha,
        });
    }

    async searchCommunityProjects(query: string): Promise<any[]> {
        if (!this.octokit) throw new Error('Not connected to GitHub');

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
}

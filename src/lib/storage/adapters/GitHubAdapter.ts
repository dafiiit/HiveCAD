import { Octokit } from 'octokit';
import { StorageAdapter, StorageType } from '../types';

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
            // Use a small delay to ensure the UI has settled (especially if called from a Dialog)
            await new Promise(resolve => setTimeout(resolve, 100));
            finalToken = window.prompt('Please enter your GitHub Personal Access Token (PAT):') || undefined;
        }

        console.log('[GitHubAdapter] final token derived:', finalToken ? 'Token provided' : 'No token');

        if (!finalToken) {
            console.log('[GitHubAdapter] Connection cancelled by user (or prompt blocked)');
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
                const create = window.confirm(`Repository '${repo}' not found. Would you like to create it?`);
                if (create) {
                    await this.octokit.rest.repos.createForAuthenticatedUser({
                        name: repo,
                        description: 'HiveCAD Projects',
                        private: false,
                    });

                    // Add topic
                    await this.octokit.rest.repos.replaceAllTopics({
                        owner,
                        repo,
                        names: ['hivecad-project'],
                    });

                    return true;
                }
            }
            throw error;
        }
    }

    async save(projectId: string, data: any): Promise<void> {
        if (!this.isAuthenticated() || !this.octokit || !this.authenticatedUser) {
            throw new Error('Not authenticated with GitHub');
        }

        if (this.currentOwner !== this.authenticatedUser) {
            throw new Error('Can only save to repositories owned by the authenticated user');
        }

        const owner = this.currentOwner!;
        const repo = this.currentRepo!;

        await this.ensureRepoExists(owner, repo);

        const path = `hivecad/${projectId}.json`;
        const content = btoa(JSON.stringify(data, null, 2));

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

        // Ensure topic is present (idempotent)
        await this.octokit.rest.repos.replaceAllTopics({
            owner,
            repo,
            names: ['hivecad-project'],
        });

        console.log(`[GitHubAdapter] Saved ${projectId} to ${owner}/${repo}`);
    }

    async load(projectId: string, owner?: string, repo?: string): Promise<any> {
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
}

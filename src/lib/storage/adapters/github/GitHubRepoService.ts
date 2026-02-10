import { Octokit } from 'octokit';
import { EXAMPLES } from '../../../data/examples';
import { retryOperation } from './GitHubHelpers';

/**
 * Handles repository initialization, reset, and maintenance operations.
 */
export class GitHubRepoService {
    constructor(
        private getOctokit: () => Octokit | null,
        private getOwner: () => string | null,
        private getRepo: () => string | null,
        private getBranch: () => string,
        private getAuthenticatedUser: () => string | null
    ) { }

    async resetRepository(): Promise<void> {
        const octokit = this.getOctokit();
        const user = this.getAuthenticatedUser();
        const owner = this.getOwner();
        const repo = this.getRepo();
        if (!octokit || !user || !owner || !repo) {
            throw new Error('Not authenticated with GitHub');
        }

        console.log(`[GitHubAdapter] Resetting repository ${owner}/${repo}...`);

        try {
            await this.cleanDirectory('', owner, repo);
            console.log(`[GitHubAdapter] Repository ${owner}/${repo} reset successfully.`);
        } catch (error: any) {
            console.error('[GitHubAdapter] Failed to reset repository:', error);
            throw error;
        }
    }

    async cleanDirectory(path: string, owner: string, repo: string): Promise<void> {
        const octokit = this.getOctokit();
        if (!octokit) return;

        try {
            const { data: contents } = await octokit.rest.repos.getContent({
                owner,
                repo,
                path,
            });

            if (Array.isArray(contents)) {
                for (const item of contents) {
                    if (item.type === 'file') {
                        await octokit.rest.repos.deleteFile({
                            owner,
                            repo,
                            path: item.path,
                            message: `Clean up ${item.path} for repo reset`,
                            sha: item.sha,
                        });
                        console.log(`[GitHubAdapter] Deleted file ${item.path}`);
                    } else if (item.type === 'dir') {
                        await this.cleanDirectory(item.path, owner, repo);
                    }
                }
            }
        } catch (error: any) {
            if (error.status === 404) return;
            throw error;
        }
    }

    async initializeRepository(): Promise<void> {
        const octokit = this.getOctokit();
        const user = this.getAuthenticatedUser();
        const owner = this.getOwner();
        const repo = this.getRepo();
        if (!octokit || !user || !owner || !repo) return;

        console.log('[GitHubAdapter] Initializing repository...');

        const requiredFiles = [
            'hivecad/index.json',
            'hivecad/tags.json',
            '.hivecad/folders.json',
            'settings/ui.json',
        ];

        const missingFiles: string[] = [];

        for (const filePath of requiredFiles) {
            try {
                await octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: filePath,
                    ref: this.getBranch(),
                });
            } catch (error: any) {
                if (error.status === 404) {
                    missingFiles.push(filePath);
                } else {
                    console.warn(`[GitHubAdapter] Error checking ${filePath}:`, error.status);
                }
            }
        }

        if (missingFiles.length > 0) {
            console.log(`[GitHubAdapter] Missing files detected: ${missingFiles.join(', ')}`);
            console.log('[GitHubAdapter] Reinitializing repository...');
            await this.populateDefaultContent();
        } else {
            console.log('[GitHubAdapter] Repository fully initialized');
        }
    }

    async populateDefaultContent(): Promise<void> {
        const octokit = this.getOctokit();
        const user = this.getAuthenticatedUser();
        const owner = this.getOwner();
        const repo = this.getRepo();
        if (!octokit || !user || !owner || !repo) return;

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

                try {
                    const { data: existing } = await octokit.rest.repos.getContent({
                        owner,
                        repo,
                        path: file.path,
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

                const content = btoa(file.content);
                await octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: file.path,
                    message: file.message,
                    content,
                    branch: this.getBranch(),
                });

                console.log(`[GitHubAdapter] ✓ ${file.path} created`);
            } catch (error: any) {
                if (error.message?.includes('"sha" wasn\'t supplied') || error.status === 409) {
                    console.log(`[GitHubAdapter] ${file.path} already exists (detected during creation), skipping`);
                    continue;
                }
                console.error(`[GitHubAdapter] Failed to create ${file.path}:`, error);
            }
        }

        console.log('[GitHubAdapter] Default content population complete');
    }

    async ensureRepoExists(owner: string, repo: string): Promise<void> {
        const octokit = this.getOctokit();
        if (!octokit) throw new Error('Not connected');
        try {
            await octokit.rest.repos.get({
                owner,
                repo,
            });
        } catch (error: any) {
            throw new Error(`Repository ${owner}/${repo} does not exist or is not accessible.`);
        }
    }

    async createIssue(title: string, body: string): Promise<void> {
        const octokit = this.getOctokit();
        if (!octokit) {
            throw new Error('Not authenticated with GitHub');
        }

        const feedbackOwner = 'dafiiit';
        const feedbackRepo = 'HiveCAD';

        try {
            console.log(`[GitHubAdapter] Creating issue on ${feedbackOwner}/${feedbackRepo}...`);
            await octokit.rest.issues.create({
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
}

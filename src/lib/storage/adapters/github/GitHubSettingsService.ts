import { Octokit } from 'octokit';
import { retryOperation } from './GitHubHelpers';

/**
 * Handles user settings persistence (save/load) for the GitHubAdapter.
 */
export class GitHubSettingsService {
    private settingsSaveLock = false;

    constructor(
        private getOctokit: () => Octokit | null,
        private getOwner: () => string | null,
        private getRepo: () => string | null,
        private getBranch: () => string
    ) { }

    async saveUserSettings(data: any): Promise<void> {
        const octokit = this.getOctokit();
        const owner = this.getOwner();
        const repo = this.getRepo();
        if (!octokit || !owner || !repo) return;

        if (this.settingsSaveLock) {
            console.log('[GitHubAdapter] Settings save already in progress, skipping...');
            return;
        }

        this.settingsSaveLock = true;
        console.log('[GitHubAdapter] Saving user settings...');
        const path = 'settings/ui.json';

        const fetchSha = async () => {
            try {
                const { data: existing } = await octokit.rest.repos.getContent({
                    owner: owner!,
                    repo: repo!,
                    path,
                    ref: this.getBranch(),
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

            await retryOperation(
                async () => {
                    await octokit.rest.repos.createOrUpdateFileContents({
                        owner: owner!,
                        repo: repo!,
                        path,
                        message: 'Update user UI settings',
                        content: btoa(JSON.stringify(data, null, 2)),
                        sha: currentSha,
                        branch: this.getBranch(),
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
        const octokit = this.getOctokit();
        const owner = this.getOwner();
        const repo = this.getRepo();
        if (!octokit || !owner || !repo) return null;

        console.log('[GitHubAdapter] Loading user settings...');
        const path = 'settings/ui.json';

        try {
            const { data: fileData } = await octokit.rest.repos.getContent({
                owner,
                repo,
                path,
                ref: this.getBranch(),
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

import { Octokit } from 'octokit';
import { ProjectData, CommitInfo, BranchInfo } from '../../types';
import { retryOperation } from './GitHubHelpers';

/**
 * Handles Git branch & commit history operations for the GitHubAdapter.
 */
export class GitHubBranchService {
    constructor(
        private getOctokit: () => Octokit | null,
        private getOwner: () => string | null,
        private getRepo: () => string | null,
        private getBranch: () => string,
        private setBranch: (branch: string) => void
    ) { }

    async getHistory(projectId: string): Promise<CommitInfo[]> {
        const octokit = this.getOctokit();
        const owner = this.getOwner();
        const repo = this.getRepo();
        if (!octokit || !owner || !repo) return [];

        try {
            const response = await octokit.request('GET /repos/{owner}/{repo}/commits', {
                owner,
                repo,
                path: `hivecad/${projectId}.json`,
                sha: this.getBranch(),
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
                refNames: [commit.sha === response.data[0].sha ? this.getBranch() : '']
            }));
        } catch (error) {
            console.error('[GitHubAdapter] Failed to get history:', error);
            return [];
        }
    }

    async createBranch(projectId: string, sourceSha: string, branchName: string): Promise<void> {
        const octokit = this.getOctokit();
        const owner = this.getOwner();
        const repo = this.getRepo();
        if (!octokit || !owner || !repo) throw new Error('Not connected');

        const fullBranchName = branchName.startsWith('project/') ? branchName : `project/${projectId}/${branchName}`;
        const ref = `refs/heads/${fullBranchName}`;

        try {
            await octokit.rest.git.createRef({
                owner,
                repo,
                ref,
                sha: sourceSha,
            });
            console.log(`[GitHubAdapter] Created branch ${ref} at ${sourceSha}`);
        } catch (error: any) {
            if (error.status === 422) {
                throw new Error(`Branch ${fullBranchName} already exists`);
            }
            throw error;
        }
    }

    async getBranches(projectId: string): Promise<BranchInfo[]> {
        const octokit = this.getOctokit();
        const owner = this.getOwner();
        const repo = this.getRepo();
        if (!octokit || !owner || !repo) return [];

        try {
            const { data: branches } = await octokit.rest.repos.listBranches({
                owner,
                repo,
            });

            const relevantBranches = branches.filter(b =>
                b.name === 'main' ||
                b.name === 'master' ||
                b.name.startsWith(`project/${projectId}/`)
            );

            return relevantBranches.map(b => ({
                name: b.name,
                sha: b.commit.sha,
                isCurrent: b.name === this.getBranch()
            }));
        } catch (error) {
            console.error('[GitHubAdapter] Failed to list branches:', error);
            return [];
        }
    }

    async switchBranch(branchName: string): Promise<void> {
        const exists = await this.ensureBranchExists(branchName);
        if (!exists) throw new Error(`Branch ${branchName} does not exist`);

        this.setBranch(branchName);
        console.log(`[GitHubAdapter] Switched to branch ${branchName}`);
    }

    async getCurrentBranch(): Promise<string> {
        return this.getBranch();
    }

    async ensureBranchExists(branchName: string): Promise<boolean> {
        const octokit = this.getOctokit();
        const owner = this.getOwner();
        const repo = this.getRepo();
        if (!octokit || !owner || !repo) return false;
        try {
            await octokit.rest.repos.getBranch({
                owner,
                repo,
                branch: branchName,
            });
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * GitHub RemoteStore — pushes/pulls project data to a user's GitHub repo.
 *
 * Repo layout:
 *   hivecad/projects/{id}/meta.json      – ProjectMeta
 *   hivecad/projects/{id}/snapshot.json   – ProjectSnapshot
 *   hivecad/projects/{id}/namespaces.json – namespace data
 *   hivecad/thumbnails/{id}.png           – thumbnail (base64)
 *   hivecad/settings/ui.json              – user settings
 *   extensions/{extId}/manifest.json      – extension manifest
 *   extensions/{extId}/index.ts           – extension code
 *   extensions/{extId}/README.md          – extension readme
 *
 * Uses the Git Tree API for atomic multi-file commits.
 */

import { Octokit } from 'octokit';
import type {
    RemoteStore, ProjectData, ProjectMeta, ProjectId,
    CommitInfo, BranchInfo, CommitHash, ExtensionEntry,
} from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function utf8ToBase64(str: string): string {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (b) => String.fromCodePoint(b)).join('');
    return btoa(binString);
}

function base64ToUtf8(b64: string): string {
    const binString = atob(b64.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binString, (c) => c.codePointAt(0)!);
    return new TextDecoder().decode(bytes);
}

async function retryOn409<T>(
    op: () => Promise<T>,
    maxRetries = 3,
): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await op();
        } catch (err: any) {
            if (err.status === 409 && i < maxRetries - 1) {
                const delay = 500 * Math.pow(2, i) + Math.random() * 500;
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
    throw new Error('retryOn409 exhausted');
}

// ─── Implementation ─────────────────────────────────────────────────────────

const REPO_NAME = 'hivecad-data';

export class GitHubRemoteStore implements RemoteStore {
    readonly providerKey = 'github';
    readonly providerName = 'GitHub';

    private octokit: Octokit | null = null;
    private owner: string | null = null;
    private repo = REPO_NAME;
    private branch = 'main';

    // ─── Auth ───────────────────────────────────────────────────────────────

    async connect(token: string): Promise<boolean> {
        try {
            const octokit = new Octokit({ auth: token });
            const { data: user } = await octokit.rest.users.getAuthenticated();
            this.octokit = octokit;
            this.owner = user.login;

            // Ensure the repo exists
            await this.ensureRepo();
            return true;
        } catch (err) {
            console.error('[GitHubRemoteStore] connect failed:', err);
            this.octokit = null;
            this.owner = null;
            return false;
        }
    }

    async disconnect(): Promise<void> {
        this.octokit = null;
        this.owner = null;
    }

    isConnected(): boolean {
        return this.octokit !== null && this.owner !== null;
    }

    // ─── Projects ───────────────────────────────────────────────────────────

    async pushProject(data: ProjectData): Promise<void> {
        const files = [
            {
                path: `hivecad/projects/${data.meta.id}/meta.json`,
                content: JSON.stringify(data.meta, null, 2),
            },
            {
                path: `hivecad/projects/${data.meta.id}/snapshot.json`,
                content: JSON.stringify(data.snapshot, null, 2),
            },
            {
                path: `hivecad/projects/${data.meta.id}/namespaces.json`,
                content: JSON.stringify(data.namespaces, null, 2),
            },
        ];
        await this.commitTree(`Save project "${data.meta.name}"`, files);
    }

    async pullProject(id: ProjectId): Promise<ProjectData | null> {
        try {
            const [metaRaw, snapshotRaw, namespacesRaw] = await Promise.all([
                this.readFile(`hivecad/projects/${id}/meta.json`),
                this.readFile(`hivecad/projects/${id}/snapshot.json`),
                this.readFile(`hivecad/projects/${id}/namespaces.json`),
            ]);
            if (!metaRaw) return null;
            return {
                meta: JSON.parse(metaRaw),
                snapshot: snapshotRaw ? JSON.parse(snapshotRaw) : { code: '', objects: [] },
                namespaces: namespacesRaw ? JSON.parse(namespacesRaw) : {},
            };
        } catch {
            return null;
        }
    }

    async pullAllProjectMetas(): Promise<ProjectMeta[]> {
        try {
            const dirs = await this.listDir('hivecad/projects');
            const metas: ProjectMeta[] = [];
            for (const dir of dirs) {
                if (dir.type !== 'dir') continue;
                const raw = await this.readFile(`hivecad/projects/${dir.name}/meta.json`);
                if (raw) {
                    try { metas.push(JSON.parse(raw)); } catch { /* skip corrupt */ }
                }
            }
            return metas;
        } catch {
            return [];
        }
    }

    async deleteProject(id: ProjectId): Promise<void> {
        // Delete project directory by removing all files inside it
        const files = await this.listDir(`hivecad/projects/${id}`);
        for (const f of files) {
            if (f.type === 'file') {
                await this.deleteFile(`hivecad/projects/${id}/${f.name}`);
            }
        }
        // Also delete thumbnail
        try {
            await this.deleteFile(`hivecad/thumbnails/${id}.png`);
        } catch { /* ok if missing */ }
    }

    // ─── Thumbnails ─────────────────────────────────────────────────────────

    async pushThumbnail(id: ProjectId, base64: string): Promise<void> {
        // Use commitTree for atomic update (base64 is already encoded, don't double-encode)
        await this.commitTree(`Update thumbnail for ${id}`, [
            {
                path: `hivecad/thumbnails/${id}.png`,
                content: base64,
            },
        ]);
    }

    async pullThumbnail(id: ProjectId): Promise<string | null> {
        return this.readFile(`hivecad/thumbnails/${id}.png`);
    }

    // ─── History / Branches ─────────────────────────────────────────────────

    async getHistory(id: ProjectId): Promise<CommitInfo[]> {
        if (!this.octokit || !this.owner) return [];
        try {
            const { data } = await this.octokit.request('GET /repos/{owner}/{repo}/commits', {
                owner: this.owner,
                repo: this.repo,
                path: `hivecad/projects/${id}/snapshot.json`,
                sha: this.branch,
                per_page: 50,
            });
            return data.map((c: any) => ({
                hash: c.sha,
                parents: c.parents.map((p: any) => p.sha),
                author: {
                    name: c.commit.author?.name ?? 'Unknown',
                    email: c.commit.author?.email,
                    date: c.commit.author?.date ?? new Date().toISOString(),
                },
                message: c.commit.message,
            }));
        } catch {
            return [];
        }
    }

    async getBranches(_id: ProjectId): Promise<BranchInfo[]> {
        if (!this.octokit || !this.owner) return [];
        try {
            const { data } = await this.octokit.rest.repos.listBranches({
                owner: this.owner,
                repo: this.repo,
            });
            return data.map((b) => ({
                name: b.name,
                sha: b.commit.sha,
                isCurrent: b.name === this.branch,
            }));
        } catch {
            return [];
        }
    }

    async createBranch(_id: ProjectId, name: string, fromSha: CommitHash): Promise<void> {
        if (!this.octokit || !this.owner) throw new Error('Not connected');
        await this.octokit.rest.git.createRef({
            owner: this.owner,
            repo: this.repo,
            ref: `refs/heads/${name}`,
            sha: fromSha,
        });
    }

    // ─── Extensions ─────────────────────────────────────────────────────────

    async submitExtension(ext: Partial<ExtensionEntry>): Promise<string> {
        if (!this.octokit || !this.owner) throw new Error('Not connected');
        const id = ext.id ?? ext.manifest?.id ?? 'unnamed';

        const manifest = {
            id,
            name: ext.manifest?.name ?? id,
            description: ext.manifest?.description ?? '',
            author: ext.manifest?.author ?? '',
            version: ext.manifest?.version ?? '1.0.0',
            icon: ext.manifest?.icon ?? 'Package',
        };

        const readme = `# ${manifest.name}\n\n${manifest.description}\n`;
        const indexTs = `// ${manifest.name}\nexport default {};\n`;

        const files = [
            { path: `extensions/${id}/manifest.json`, content: JSON.stringify(manifest, null, 2) },
            { path: `extensions/${id}/README.md`, content: readme },
            { path: `extensions/${id}/index.ts`, content: indexTs },
        ];
        await this.commitTree(`Create extension "${manifest.name}"`, files);
        return `https://github.com/${this.owner}/${this.repo}/tree/${this.branch}/extensions/${id}`;
    }

    // ─── Settings ───────────────────────────────────────────────────────────

    async pushUserSettings(data: any): Promise<void> {
        await this.writeFile(
            'hivecad/settings/ui.json',
            JSON.stringify(data, null, 2),
            'Update user settings',
        );
    }

    async pullUserSettings(): Promise<any> {
        const raw = await this.readFile('hivecad/settings/ui.json');
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    }

    // ─── Maintenance ────────────────────────────────────────────────────────

    async resetRepository(): Promise<void> {
        if (!this.octokit || !this.owner) throw new Error('Not connected');

        console.log('[GitHubRemoteStore] Resetting repository - deleting all projects and extensions...');

        await retryOn409(async () => {
            const { data: refData } = await this.octokit!.rest.git.getRef({
                owner: this.owner!,
                repo: this.repo,
                ref: `heads/${this.branch}`,
            });
            const latestCommitSha = refData.object.sha;

            const { data: commitData } = await this.octokit!.rest.git.getCommit({
                owner: this.owner!,
                repo: this.repo,
                commit_sha: latestCommitSha,
            });

            const { data: fullTree } = await this.octokit!.rest.git.getTree({
                owner: this.owner!,
                repo: this.repo,
                tree_sha: commitData.tree.sha,
                recursive: '1',
            });

            const pathsToDelete = (fullTree.tree ?? [])
                .filter((entry: any) =>
                    entry.type === 'blob' &&
                    typeof entry.path === 'string' &&
                    (
                        entry.path.startsWith('hivecad/') ||
                        entry.path.startsWith('extensions/') ||
                        entry.path.startsWith('projects/')
                    )
                )
                .map((entry: any) => entry.path as string);

            if (pathsToDelete.length === 0) {
                console.log('[GitHubRemoteStore] Repository reset complete (nothing to delete)');
                return;
            }

            const deleteEntries = pathsToDelete.map((path) => ({
                path,
                mode: '100644' as const,
                type: 'blob' as const,
                sha: null,
            }));

            const { data: newTree } = await this.octokit!.rest.git.createTree({
                owner: this.owner!,
                repo: this.repo,
                base_tree: commitData.tree.sha,
                tree: deleteEntries,
            });

            const { data: newCommit } = await this.octokit!.rest.git.createCommit({
                owner: this.owner!,
                repo: this.repo,
                message: 'Reset HiveCAD repository data',
                tree: newTree.sha,
                parents: [latestCommitSha],
            });

            await this.octokit!.rest.git.updateRef({
                owner: this.owner!,
                repo: this.repo,
                ref: `heads/${this.branch}`,
                sha: newCommit.sha,
                force: true,
            });

            console.log(`[GitHubRemoteStore] Repository reset complete (deleted ${pathsToDelete.length} files)`);
        });
    }

    async createIssue(title: string, body: string): Promise<void> {
        if (!this.octokit) throw new Error('Not connected');
        await this.octokit.rest.issues.create({
            owner: 'dafiiit',
            repo: 'HiveCAD',
            title,
            body,
            labels: ['feedback'],
        });
    }

    // ─── Git Helpers ────────────────────────────────────────────────────────

    private async ensureRepo(): Promise<void> {
        if (!this.octokit || !this.owner) return;
        try {
            const { data } = await this.octokit.rest.repos.get({ owner: this.owner, repo: this.repo });
            if (data?.default_branch) this.branch = data.default_branch;
        } catch (err: any) {
            if (err.status === 404) {
                const { data } = await this.octokit.rest.repos.createForAuthenticatedUser({
                    name: this.repo,
                    private: true,
                    auto_init: true,
                    description: 'HiveCAD project storage (auto-created)',
                });
                if (data?.default_branch) this.branch = data.default_branch;
                console.log('[GitHubRemoteStore] Created repo', this.repo);
            } else {
                throw err;
            }
        }
    }

    private async readFile(path: string): Promise<string | null> {
        if (!this.octokit || !this.owner) return null;
        try {
            const { data } = await this.octokit.rest.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path,
                ref: this.branch,
            });
            if ('content' in data && typeof data.content === 'string') {
                return base64ToUtf8(data.content);
            }
            return null;
        } catch (err: any) {
            if (err.status === 404) return null;
            throw err;
        }
    }

    private async writeFile(path: string, content: string, message: string): Promise<void> {
        if (!this.octokit || !this.owner) return;
        await retryOn409(async () => {
            // Get current SHA if file exists
            let sha: string | undefined;
            try {
                const { data } = await this.octokit!.rest.repos.getContent({
                    owner: this.owner!,
                    repo: this.repo,
                    path,
                    ref: this.branch,
                });
                if ('sha' in data) sha = data.sha;
            } catch (e: any) {
                if (e.status !== 404) throw e;
            }

            await this.octokit!.rest.repos.createOrUpdateFileContents({
                owner: this.owner!,
                repo: this.repo,
                path,
                message,
                content: utf8ToBase64(content),
                sha,
                branch: this.branch,
            });
        });
    }

    private async deleteFile(path: string): Promise<void> {
        if (!this.octokit || !this.owner) return;
        await retryOn409(async () => {
            try {
                const { data } = await this.octokit!.rest.repos.getContent({
                    owner: this.owner!,
                    repo: this.repo,
                    path,
                    ref: this.branch,
                });
                if ('sha' in data) {
                    await this.octokit!.rest.repos.deleteFile({
                        owner: this.owner!,
                        repo: this.repo,
                        path,
                        message: `Delete ${path}`,
                        sha: data.sha,
                        branch: this.branch,
                    });
                }
            } catch (e: any) {
                if (e.status !== 404) throw e;
            }
        });
    }

    private async listDir(path: string): Promise<Array<{ name: string; type: string }>> {
        if (!this.octokit || !this.owner) return [];
        try {
            const { data } = await this.octokit.rest.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path,
                ref: this.branch,
            });
            if (!Array.isArray(data)) return [];
            return data.map((item: any) => ({ name: item.name, type: item.type }));
        } catch (e: any) {
            if (e.status === 404) return [];
            throw e;
        }
    }

    private async deleteDir(path: string): Promise<void> {
        const items = await this.listDir(path);
        for (const item of items) {
            const fullPath = `${path}/${item.name}`;
            if (item.type === 'dir') {
                await this.deleteDir(fullPath);
            } else {
                await this.deleteFile(fullPath);
            }
        }
    }

    /**
     * Atomic multi-file commit using the Git tree API.
     * Content is treated as UTF-8 text. For binary data, pass it base64-encoded as a string.
     */
    private async commitTree(
        message: string,
        files: Array<{ path: string; content: string }>,
    ): Promise<void> {
        if (!this.octokit || !this.owner) return;
        await retryOn409(async () => {
            const { data: refData } = await this.octokit!.rest.git.getRef({
                owner: this.owner!,
                repo: this.repo,
                ref: `heads/${this.branch}`,
            });
            const latestCommitSha = refData.object.sha;

            const { data: commitData } = await this.octokit!.rest.git.getCommit({
                owner: this.owner!,
                repo: this.repo,
                commit_sha: latestCommitSha,
            });

            const tree = files.map((f) => {
                // Check if this is a binary file (PNG, etc.) by checking the path
                const isBinary = /\.(png|jpg|jpeg|gif|pdf|zip|tar|gz)$/i.test(f.path);
                
                return {
                    path: f.path,
                    mode: '100644' as const,
                    type: 'blob' as const,
                    content: f.content,
                    encoding: isBinary ? ('base64' as const) : ('utf-8' as const),
                };
            });

            const { data: newTree } = await this.octokit!.rest.git.createTree({
                owner: this.owner!,
                repo: this.repo,
                base_tree: commitData.tree.sha,
                tree,
            });

            const { data: newCommit } = await this.octokit!.rest.git.createCommit({
                owner: this.owner!,
                repo: this.repo,
                message,
                tree: newTree.sha,
                parents: [latestCommitSha],
            });

            await this.octokit!.rest.git.updateRef({
                owner: this.owner!,
                repo: this.repo,
                ref: `heads/${this.branch}`,
                sha: newCommit.sha,
                force: true,
            });
        });
    }
}

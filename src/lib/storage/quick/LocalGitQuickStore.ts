/**
 * Local-git-backed QuickStore for the desktop (Tauri) environment.
 *
 * Every save writes to the local filesystem via Tauri `invoke()` commands
 * and immediately auto-commits so that data is never lost.
 *
 * The Tauri backend is expected to expose these commands:
 *   write_project(projectId, data)  → void
 *   read_project(projectId)         → string | null
 *   list_projects()                 → string[]
 *   delete_project(projectId)       → void
 *   git_init()                      → void
 *   git_commit(message)             → void
 *   git_status()                    → string
 *   git_sync(token?)               → void
 */

import type {
    QuickStore, ProjectData, ProjectMeta, ProjectId,
    CommitHash, CommitInfo, BranchInfo,
} from '../types';
import { ID } from '../../utils/id-generator';

// We dynamically import Tauri APIs to enable tree-shaking on web builds.
const tauriInvoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
};

const genId = () => ID.generatePrefixed('commit');

export class LocalGitQuickStore implements QuickStore {
    private listeners = new Set<() => void>();

    async init(): Promise<void> {
        await tauriInvoke('git_init');
    }

    // ─── Projects ──────────────────────────────────────────────────────────

    async saveProject(data: ProjectData): Promise<void> {
        const json = JSON.stringify(data, null, 2);
        await tauriInvoke('write_project', { projectId: data.meta.id, data: json });
        // Auto-commit instantly so data is never lost
        try {
            await tauriInvoke('git_commit', {
                message: `Save ${data.meta.name} (${data.meta.id})`,
            });
        } catch (err) {
            // git_commit may fail if there are no changes — that's fine
            console.warn('[LocalGitQuickStore] git_commit after save:', err);
        }
        this.emit();
    }

    async loadProject(id: ProjectId): Promise<ProjectData | null> {
        const raw = await tauriInvoke<string | null>('read_project', { projectId: id });
        if (!raw) return null;
        try {
            return JSON.parse(raw) as ProjectData;
        } catch {
            console.error(`[LocalGitQuickStore] Failed to parse project ${id}`);
            return null;
        }
    }

    async deleteProject(id: ProjectId): Promise<void> {
        await tauriInvoke('delete_project', { projectId: id });
        try {
            await tauriInvoke('git_commit', { message: `Delete project ${id}` });
        } catch (err) {
            console.warn('[LocalGitQuickStore] git_commit after delete:', err);
        }
        this.emit();
    }

    async listProjects(): Promise<ProjectMeta[]> {
        const ids = await tauriInvoke<string[]>('list_projects');
        const metas: ProjectMeta[] = [];
        for (const id of ids) {
            const project = await this.loadProject(id);
            if (project?.meta) metas.push(project.meta);
        }
        return metas;
    }

    async clearAll(): Promise<void> {
        const ids = await tauriInvoke<string[]>('list_projects');
        await Promise.all(ids.map(id => this.deleteProject(id)));
        try {
            await tauriInvoke('git_commit', { message: 'Clear all projects' });
        } catch (err) {
            console.warn('[LocalGitQuickStore] git_commit after clearAll:', err);
        }
        this.emit();
    }

    // ─── Commits ────────────────────────────────────────────────────────────

    async commit(id: ProjectId, message: string, _author: string): Promise<CommitHash> {
        await tauriInvoke('git_commit', { message: `[${id}] ${message}` });
        const hash = genId(); // We don't have real git SHA access from Tauri — use synthetic
        this.emit();
        return hash;
    }

    async getHistory(_id: ProjectId): Promise<CommitInfo[]> {
        // Could be enhanced by a Tauri command that runs `git log`
        return [];
    }

    async getBranches(_id: ProjectId): Promise<BranchInfo[]> {
        return [{ name: 'main', sha: '', isCurrent: true }];
    }

    async createBranch(_id: ProjectId, _name: string, _fromHash: CommitHash): Promise<void> {
        // Could be enhanced by a Tauri git branch command
    }

    async switchBranch(_id: ProjectId, _name: string): Promise<void> {
        // Could be enhanced by a Tauri git checkout command
    }

    // ─── Change Listener ────────────────────────────────────────────────────

    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(): void {
        this.listeners.forEach((fn) => fn());
    }
}

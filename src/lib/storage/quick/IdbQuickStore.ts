/**
 * IndexedDB-backed QuickStore for the web (online) environment.
 *
 * Uses idb-keyval as a lightweight KV store.
 * Project data lives in RAM during the session and is flushed to IndexedDB
 * on every save so that an accidental tab-close doesn't lose data.
 *
 * Commit history is kept as a simple append-only log per project (in RAM + IDB).
 * This is NOT a full git implementation — just enough to give the user
 * undo-checkpoint semantics and branch pointers.
 *
 * Tombstone system:
 *   When a project is deleted, a tombstone record is written so the SyncEngine
 *   knows not to re-pull the project from remote. Tombstones expire after 30 days.
 */

import { get, set, del, keys } from 'idb-keyval';
import type {
    QuickStore, ProjectData, ProjectMeta, ProjectId,
    CommitHash, CommitInfo, BranchInfo,
} from '../types';

// ─── IDB key prefixes ──────────────────────────────────────────────────────

const PROJECT_KEY = (id: string) => `hive:project:${id}`;
const META_KEY = (id: string) => `hive:meta:${id}`;
const COMMITS_KEY = (id: string) => `hive:commits:${id}`;
const BRANCHES_KEY = (id: string) => `hive:branches:${id}`;
const TOMBSTONE_KEY = (id: string) => `hive:tombstone:${id}`;
const SETTINGS_KEY = 'hive:settings';

/** Tombstones expire after 30 days */
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Helpers ────────────────────────────────────────────────────────────────

const genId = () => Math.random().toString(36).substring(2, 11);

interface StoredBranches {
    branches: Record<string, CommitHash>;
    head: string;
}

interface Tombstone {
    projectId: string;
    deletedAt: number;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export class IdbQuickStore implements QuickStore {
    private listeners = new Set<() => void>();

    async init(): Promise<void> {
        // Prune expired tombstones on startup
        await this.pruneExpiredTombstones();
    }

    // ─── Projects ───────────────────────────────────────────────────────────

    async saveProject(data: ProjectData): Promise<void> {
        // If we're saving a project, clear any tombstone for it
        // (user explicitly re-created or re-imported it)
        await del(TOMBSTONE_KEY(data.meta.id));
        await Promise.all([
            set(PROJECT_KEY(data.meta.id), data),
            set(META_KEY(data.meta.id), data.meta),
        ]);
        this.emit();
    }

    async loadProject(id: ProjectId): Promise<ProjectData | null> {
        return (await get<ProjectData>(PROJECT_KEY(id))) ?? null;
    }

    async deleteProject(id: ProjectId): Promise<void> {
        // Write tombstone BEFORE deleting so sync engine sees it
        await set(TOMBSTONE_KEY(id), { projectId: id, deletedAt: Date.now() } as Tombstone);
        await Promise.all([
            del(PROJECT_KEY(id)),
            del(META_KEY(id)),
            del(COMMITS_KEY(id)),
            del(BRANCHES_KEY(id)),
        ]);
        this.emit();
    }

    async listProjects(): Promise<ProjectMeta[]> {
        const allKeys = await keys();
        const metaKeys = allKeys.filter(
            (k) => typeof k === 'string' && k.startsWith('hive:meta:'),
        );
        const metas = await Promise.all(
            metaKeys.map((k) => get<ProjectMeta>(k as string)),
        );
        return metas.filter(Boolean) as ProjectMeta[];
    }

    async clearAll(): Promise<void> {
        const allKeys = await keys();
        const hiveKeys = allKeys.filter(
            (k) => typeof k === 'string' && k.startsWith('hive:'),
        );
        await Promise.all(hiveKeys.map((k) => del(k)));
        this.emit();
    }

    // ─── Tombstones ─────────────────────────────────────────────────────────

    /** Check if a project was intentionally deleted (tombstoned). */
    async isTombstoned(id: ProjectId): Promise<boolean> {
        const tombstone = await get<Tombstone>(TOMBSTONE_KEY(id));
        if (!tombstone) return false;
        // Check if tombstone has expired
        if (Date.now() - tombstone.deletedAt > TOMBSTONE_TTL_MS) {
            await del(TOMBSTONE_KEY(id));
            return false;
        }
        return true;
    }

    /** Get all active (non-expired) tombstone IDs. */
    async getTombstonedIds(): Promise<Set<string>> {
        const allKeys = await keys();
        const tombstoneKeys = allKeys.filter(
            (k) => typeof k === 'string' && k.startsWith('hive:tombstone:'),
        );
        const ids = new Set<string>();
        const now = Date.now();
        for (const key of tombstoneKeys) {
            const tombstone = await get<Tombstone>(key as string);
            if (tombstone && now - tombstone.deletedAt <= TOMBSTONE_TTL_MS) {
                ids.add(tombstone.projectId);
            } else {
                // Clean up expired tombstone
                await del(key);
            }
        }
        return ids;
    }

    /** Remove a specific tombstone (e.g., after propagating deletion to all stores). */
    async clearTombstone(id: ProjectId): Promise<void> {
        await del(TOMBSTONE_KEY(id));
    }

    /** Remove all expired tombstones. */
    private async pruneExpiredTombstones(): Promise<void> {
        const allKeys = await keys();
        const tombstoneKeys = allKeys.filter(
            (k) => typeof k === 'string' && k.startsWith('hive:tombstone:'),
        );
        const now = Date.now();
        for (const key of tombstoneKeys) {
            const tombstone = await get<Tombstone>(key as string);
            if (!tombstone || now - tombstone.deletedAt > TOMBSTONE_TTL_MS) {
                await del(key);
            }
        }
    }

    // ─── Commits ────────────────────────────────────────────────────────────

    async commit(id: ProjectId, message: string, author: string): Promise<CommitHash> {
        const project = await this.loadProject(id);
        if (!project) throw new Error(`Project ${id} not found`);

        const branchData = await this.getBranchData(id);
        const parentHash = branchData.branches[branchData.head] || null;

        const hash = genId();
        const commit: CommitInfo = {
            hash,
            parents: parentHash ? [parentHash] : [],
            author: { name: author, date: new Date().toISOString() },
            message,
            refNames: [branchData.head],
        };

        // Append commit
        const commits = (await get<CommitInfo[]>(COMMITS_KEY(id))) ?? [];
        commits.push(commit);
        await set(COMMITS_KEY(id), commits);

        // Move branch pointer
        branchData.branches[branchData.head] = hash;
        await set(BRANCHES_KEY(id), branchData);

        this.emit();
        return hash;
    }

    async getHistory(id: ProjectId): Promise<CommitInfo[]> {
        return ((await get<CommitInfo[]>(COMMITS_KEY(id))) ?? []).slice().reverse();
    }

    async getBranches(id: ProjectId): Promise<BranchInfo[]> {
        const data = await this.getBranchData(id);
        return Object.entries(data.branches).map(([name, sha]) => ({
            name,
            sha,
            isCurrent: name === data.head,
        }));
    }

    async createBranch(id: ProjectId, name: string, fromHash: CommitHash): Promise<void> {
        const data = await this.getBranchData(id);
        if (data.branches[name]) throw new Error(`Branch "${name}" already exists`);
        data.branches[name] = fromHash;
        await set(BRANCHES_KEY(id), data);
        this.emit();
    }

    async switchBranch(id: ProjectId, name: string): Promise<void> {
        const data = await this.getBranchData(id);
        if (!data.branches[name]) throw new Error(`Branch "${name}" does not exist`);
        data.head = name;
        await set(BRANCHES_KEY(id), data);
        this.emit();
    }

    // ─── Settings ───────────────────────────────────────────────────────────

    // (Quick store doesn't do tags/folders — those go to Supabase in the new arch.)
    // Keeping stubs for the interface.

    // ─── Change Listener ────────────────────────────────────────────────────

    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    // ─── Private Helpers ────────────────────────────────────────────────────

    private emit(): void {
        this.listeners.forEach((fn) => fn());
    }

    private async getBranchData(id: ProjectId): Promise<StoredBranches> {
        return (
            (await get<StoredBranches>(BRANCHES_KEY(id))) ?? {
                branches: { main: '' },
                head: 'main',
            }
        );
    }
}

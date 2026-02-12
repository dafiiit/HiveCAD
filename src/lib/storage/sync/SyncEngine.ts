/**
 * SyncEngine — orchestrates background synchronisation between
 * QuickStore ↔ RemoteStore ↔ Supabase.
 *
 * Respects tombstones: when a project is deleted locally, a tombstone
 * record is created so that the sync engine propagates the deletion
 * to remote stores instead of re-pulling the project.
 *
 * Key design decisions:
 *   - GitHub sync works independently of Supabase (no userId needed for push/pull).
 *   - Tombstones prevent the "delete → re-sync → ghost project" cycle.
 *   - After propagating a deletion to all stores, the tombstone is kept
 *     for 30 days to handle race conditions with other devices.
 *
 * Behaviour:
 *   Web app:
 *     - Syncs every 30 s while online.
 *     - Syncs when a project is closed.
 *     - Manual sync via `syncNow()`.
 *
 *   Desktop app:
 *     - Syncs on explicit user request (less urgent — local git is durable).
 *     - Can sync manually at any time.
 *
 * The engine is designed to be **idempotent** — calling `syncNow()` while
 * a sync is already running is a no-op.
 */

import type {
    QuickStore, RemoteStore, SupabaseMeta,
    SyncState, SyncStatus, ProjectMeta, ProjectData,
} from '../types';
import type { IdbQuickStore } from '../quick/IdbQuickStore';

export class SyncEngine {
    private _state: SyncState = {
        status: 'idle',
        lastSyncTime: null,
        hasPendingChanges: false,
        lastError: null,
        wouldLoseData: false,
    };

    private intervalId: ReturnType<typeof setInterval> | null = null;
    private listeners = new Set<(s: SyncState) => void>();
    private syncing = false;
    private suspended = false;

    /** Public read-only accessor for current sync state */
    get state(): SyncState {
        return this._state;
    }

    constructor(
        private quick: QuickStore,
        private remote: RemoteStore | null,
        private meta: SupabaseMeta | null,
        private getUserId: () => string | null,
        private getUserEmail: () => string | null,
    ) {
        // Listen for local changes to track pending state
        this.quick.onChange(() => {
            this._state = { ...this._state, hasPendingChanges: true, wouldLoseData: true };
            this.emit();
        });
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    /** Start automatic background sync (web only). */
    startAutoSync(intervalMs = 30_000): void {
        this.stopAutoSync();
        this.intervalId = setInterval(() => this.syncNow(), intervalMs);
    }

    /** Stop automatic background sync. */
    stopAutoSync(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /** Trigger a sync immediately. Idempotent — skips if already syncing. */
    async syncNow(): Promise<void> {
        if (this.syncing) return;
        if (this.suspended) return;
        if (!this.remote?.isConnected()) {
            this._state = { ...this._state, status: 'offline' };
            this.emit();
            return;
        }

        this.syncing = true;
        this._state = { ...this._state, status: 'syncing', lastError: null };
        this.emit();

        try {
            await this.doSync();
            this._state = {
                ...this._state,
                status: 'idle',
                lastSyncTime: Date.now(),
                hasPendingChanges: false,
                wouldLoseData: false,
                lastError: null,
            };
        } catch (err: any) {
            console.error('[SyncEngine] sync failed:', err);
            this._state = {
                ...this._state,
                status: 'error',
                lastError: err.message ?? String(err),
            };
        } finally {
            this.syncing = false;
            this.emit();
        }
    }

    /** Current sync state (read-only snapshot). */
    getState(): Readonly<SyncState> {
        return this._state;
    }

    /** Subscribe to state changes. Returns unsubscribe function. */
    subscribe(listener: (s: SyncState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Mark that there are pending changes (called by the store on save). */
    markDirty(): void {
        this._state = { ...this._state, hasPendingChanges: true, wouldLoseData: true };
        this.emit();
    }

    /** Suspend sync activity temporarily (used for destructive maintenance operations). */
    suspend(): void {
        this.suspended = true;
        this.stopAutoSync();
    }

    /** Resume sync activity after temporary suspension. */
    resumeAutoSync(intervalMs = 30_000): void {
        this.suspended = false;
        if (this.remote?.isConnected()) {
            this.startAutoSync(intervalMs);
        }
    }

    /** Wait until any in-flight sync operation has completed. */
    async waitForIdle(timeoutMs = 15_000): Promise<void> {
        const startedAt = Date.now();
        while (this.syncing) {
            if (Date.now() - startedAt > timeoutMs) {
                throw new Error('Timed out waiting for sync to become idle');
            }
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }

    // ─── Internal ───────────────────────────────────────────────────────────

    private async doSync(): Promise<void> {
        if (!this.remote) return;

        const userId = this.getUserId();
        const userEmail = this.getUserEmail();

        // Get tombstoned project IDs (these were intentionally deleted)
        const tombstonedIds = await this.getTombstonedIds();

        // ─── Phase 1: Propagate deletions ──────────────────────────────────
        // For each tombstoned project, ensure it's deleted from remote + Supabase
        for (const deletedId of tombstonedIds) {
            await this.propagateDeletion(deletedId, userId);
        }

        // ─── Phase 2: Push local projects to remote ────────────────────────
        const localMetas = await this.quick.listProjects();
        for (const localMeta of localMetas) {
            // Skip tombstoned projects (shouldn't happen, but be safe)
            if (tombstonedIds.has(localMeta.id)) continue;

            try {
                const localProject = await this.quick.loadProject(localMeta.id);
                if (!localProject) continue;

                // Set ownership fields if available
                if (userId) localProject.meta.ownerId = userId;
                if (userEmail) localProject.meta.ownerEmail = userEmail;
                localProject.meta.remoteProvider = this.remote.providerKey;

                // Push to remote (GitHub) — works without userId
                await this.remote.pushProject(localProject);
                console.log(`[SyncEngine] Pushed project "${localMeta.name}" to ${this.remote.providerKey}`);

                // Push thumbnail if present
                if (localProject.meta.thumbnail) {
                    await this.remote.pushThumbnail(localMeta.id, localProject.meta.thumbnail);
                }

                // Upsert metadata to Supabase — only if we have userId
                if (userId && this.meta) {
                    try {
                        await this.meta.upsertProjectMeta(localProject.meta);
                    } catch (err) {
                        console.warn(`[SyncEngine] Failed to upsert Supabase meta for ${localMeta.id}:`, err);
                    }
                }
            } catch (err) {
                console.warn(`[SyncEngine] Failed to push project ${localMeta.id}:`, err);
            }
        }

        // ─── Phase 3: Pull remote projects that aren't local ───────────────
        try {
            const remoteMetas = await this.remote.pullAllProjectMetas();
            const localIds = new Set(localMetas.map((m) => m.id));

            for (const remoteMeta of remoteMetas) {
                // Already have it locally — skip
                if (localIds.has(remoteMeta.id)) continue;

                // Was intentionally deleted — delete from remote too, DON'T re-pull
                if (tombstonedIds.has(remoteMeta.id)) {
                    console.log(`[SyncEngine] Skipping tombstoned project "${remoteMeta.name}" (${remoteMeta.id}) — will delete from remote`);
                    await this.propagateDeletion(remoteMeta.id, userId);
                    continue;
                }

                // Genuinely new from remote — pull it
                try {
                    const remoteProject = await this.remote.pullProject(remoteMeta.id);
                    if (remoteProject) {
                        await this.quick.saveProject(remoteProject);
                        console.log(`[SyncEngine] Pulled project "${remoteMeta.name}" from ${this.remote.providerKey}`);
                    }
                } catch (err) {
                    console.warn(`[SyncEngine] Failed to pull project ${remoteMeta.id}:`, err);
                }
            }
        } catch (err) {
            console.warn('[SyncEngine] Failed to pull remote projects:', err);
        }
    }

    /**
     * Propagate a deletion to remote + Supabase.
     * Called for tombstoned projects during sync to ensure all stores are cleaned up.
     */
    private async propagateDeletion(projectId: string, userId: string | null): Promise<void> {
        // Delete from remote (GitHub)
        if (this.remote?.isConnected()) {
            try {
                await this.remote.deleteProject(projectId);
                console.log(`[SyncEngine] Propagated deletion of ${projectId} to ${this.remote.providerKey}`);
            } catch (err) {
                console.warn(`[SyncEngine] Failed to delete ${projectId} from remote:`, err);
            }
        }

        // Delete from Supabase
        if (userId && this.meta) {
            try {
                await this.meta.deleteProjectMeta(projectId);
                console.log(`[SyncEngine] Propagated deletion of ${projectId} to Supabase`);
            } catch (err) {
                console.warn(`[SyncEngine] Failed to delete ${projectId} from Supabase:`, err);
            }
        }
    }

    /**
     * Get tombstoned project IDs from the QuickStore.
     * Works with IdbQuickStore which has tombstone support.
     * Falls back to empty set for other implementations.
     */
    private async getTombstonedIds(): Promise<Set<string>> {
        // IdbQuickStore has getTombstonedIds() method
        if ('getTombstonedIds' in this.quick && typeof (this.quick as any).getTombstonedIds === 'function') {
            return (this.quick as IdbQuickStore).getTombstonedIds();
        }
        return new Set();
    }

    private emit(): void {
        this.listeners.forEach((fn) => fn(this._state));
    }
}

/**
 * SyncEngine — orchestrates background synchronisation between
 * QuickStore ↔ RemoteStore ↔ Supabase.
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

    // ─── Internal ───────────────────────────────────────────────────────────

    private async doSync(): Promise<void> {
        const userId = this.getUserId();
        const userEmail = this.getUserEmail();
        if (!userId || !this.remote || !this.meta) return;

        // 1. Push all local projects to remote + Supabase
        const localMetas = await this.quick.listProjects();
        for (const localMeta of localMetas) {
            try {
                const localProject = await this.quick.loadProject(localMeta.id);
                if (!localProject) continue;

                // Ensure ownership fields are set
                localProject.meta.ownerId = userId;
                localProject.meta.ownerEmail = userEmail ?? '';
                localProject.meta.remoteProvider = this.remote.providerKey;

                // Push to remote
                await this.remote.pushProject(localProject);

                // Push thumbnail if present
                if (localProject.meta.thumbnail) {
                    await this.remote.pushThumbnail(localMeta.id, localProject.meta.thumbnail);
                }

                // Upsert metadata to Supabase
                await this.meta.upsertProjectMeta(localProject.meta);
            } catch (err) {
                console.warn(`[SyncEngine] Failed to push project ${localMeta.id}:`, err);
            }
        }

        // 2. Pull remote projects that aren't in local store
        try {
            const remoteMetas = await this.remote.pullAllProjectMetas();
            const localIds = new Set(localMetas.map((m) => m.id));

            for (const remoteMeta of remoteMetas) {
                if (localIds.has(remoteMeta.id)) continue;
                try {
                    const remoteProject = await this.remote.pullProject(remoteMeta.id);
                    if (remoteProject) {
                        await this.quick.saveProject(remoteProject);
                    }
                } catch (err) {
                    console.warn(`[SyncEngine] Failed to pull project ${remoteMeta.id}:`, err);
                }
            }
        } catch (err) {
            console.warn('[SyncEngine] Failed to pull remote projects:', err);
        }
    }

    private emit(): void {
        this.listeners.forEach((fn) => fn(this._state));
    }
}

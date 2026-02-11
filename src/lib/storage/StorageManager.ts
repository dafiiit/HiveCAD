/**
 * StorageManager — singleton entry point for the entire storage layer.
 *
 * Provides access to:
 *   - quickStore   (local/fast reads/writes)
 *   - remoteStore  (durable cloud backup — currently GitHub)
 *   - supabaseMeta (metadata index, social, discovery)
 *   - syncEngine   (background sync orchestrator)
 *
 * Usage:
 *   const mgr = StorageManager.getInstance();
 *   await mgr.initialize(userId, userEmail);
 *   mgr.quickStore.saveProject(data);
 *   mgr.syncEngine.syncNow();
 */

import { isDesktop } from '../platform/platform';
import type { QuickStore, RemoteStore, SupabaseMeta } from './types';
import { IdbQuickStore } from './quick/IdbQuickStore';
import { GitHubRemoteStore } from './remote/GitHubRemoteStore';
import { SupabaseMetaService } from './supabase/SupabaseMetaService';
import { SyncEngine } from './sync/SyncEngine';

export class StorageManager {
    private static instance: StorageManager;

    private _quick: QuickStore | null = null;
    private _remote: RemoteStore | null = null;
    private _meta: SupabaseMeta | null = null;
    private _sync: SyncEngine | null = null;
    private _initialized = false;

    private _getUserId: () => string | null = () => null;
    private _getUserEmail: () => string | null = () => null;

    private constructor() {}

    static getInstance(): StorageManager {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }

    // ─── Initialization ─────────────────────────────────────────────────────

    /**
     * Initialize the storage layer.
     * Call once at app startup after auth is resolved.
     */
    async initialize(
        getUserId: () => string | null,
        getUserEmail: () => string | null,
    ): Promise<void> {
        if (this._initialized) return;

        this._getUserId = getUserId;
        this._getUserEmail = getUserEmail;

        // 1. Create QuickStore (platform-specific)
        if (isDesktop()) {
            const { LocalGitQuickStore } = await import('./quick/LocalGitQuickStore');
            this._quick = new LocalGitQuickStore();
        } else {
            this._quick = new IdbQuickStore();
        }
        await this._quick.init();

        // 2. Create RemoteStore (currently always GitHub, but pluggable)
        this._remote = new GitHubRemoteStore();

        // 3. Create Supabase meta service
        this._meta = new SupabaseMetaService();

        // 4. Create SyncEngine
        this._sync = new SyncEngine(
            this._quick,
            this._remote,
            this._meta,
            this._getUserId,
            this._getUserEmail,
        );

        this._initialized = true;
        console.log(`[StorageManager] Initialized (${isDesktop() ? 'desktop' : 'web'})`);
    }

    /**
     * Connect the remote store with a token (e.g. GitHub PAT).
     * After connecting, starts auto-sync for web builds.
     */
    async connectRemote(token: string): Promise<boolean> {
        if (!this._remote) return false;
        const ok = await this._remote.connect(token);
        if (ok && !isDesktop() && this._sync) {
            this._sync.startAutoSync(30_000);
        }
        return ok;
    }

    /**
     * Disconnect remote + stop auto-sync.
     */
    async disconnectRemote(): Promise<void> {
        this._sync?.stopAutoSync();
        await this._remote?.disconnect();
    }

    // ─── Accessors ──────────────────────────────────────────────────────────

    get quickStore(): QuickStore {
        if (!this._quick) throw new Error('StorageManager not initialized');
        return this._quick;
    }

    get remoteStore(): RemoteStore | null {
        return this._remote ?? null;
    }

    get supabaseMeta(): SupabaseMeta | null {
        return this._meta ?? null;
    }

    get syncEngine(): SyncEngine | null {
        return this._sync ?? null;
    }

    get isInitialized(): boolean {
        return this._initialized;
    }

    get isRemoteConnected(): boolean {
        return this._remote?.isConnected() ?? false;
    }

    // ─── Convenience ────────────────────────────────────────────────────────

    /**
     * Reset ALL user data across all stores.
     */
    async resetAll(): Promise<void> {
        // Delete from QuickStore
        const metas = await this.quickStore.listProjects();
        for (const m of metas) {
            await this.quickStore.deleteProject(m.id);
        }

        // Delete from remote
        if (this._remote?.isConnected()) {
            await this._remote.resetRepository();
        }

        // Delete from Supabase
        const userId = this._getUserId();
        if (userId && this._meta) {
            const ownMetas = await this._meta.listOwnProjects(userId);
            for (const m of ownMetas) {
                await this._meta.deleteProjectMeta(m.id);
            }
        }

        console.log('[StorageManager] All user data reset');
    }
}

import { StorageAdapter, StorageType } from './types';
import { GitHubAdapter } from './adapters/GitHubAdapter';
import { isDesktop } from '../platform/platform';

export class StorageManager {
    private static instance: StorageManager;
    private adapters: Map<StorageType, StorageAdapter> = new Map();
    private _currentAdapter: StorageAdapter;
    private _initialized = false;

    private constructor() {
        // Register GitHubAdapter (always available)
        this.registerAdapter(new GitHubAdapter());

        // Set GitHub as initial default - will switch after async init if desktop
        this._currentAdapter = this.adapters.get('github')!;
    }

    /**
     * Initialize platform-specific adapters
     * Call this once at app startup
     */
    async initialize(): Promise<void> {
        if (this._initialized) return;

        if (isDesktop()) {
            // Dynamic import to enable tree-shaking in web builds
            const { LocalGitAdapter } = await import('./adapters/LocalGitAdapter');
            const localAdapter = new LocalGitAdapter();
            this.registerAdapter(localAdapter);
            this._currentAdapter = localAdapter;
            console.log('[StorageManager] Initialized with LocalGitAdapter for desktop');
        } else {
            console.log('[StorageManager] Initialized with GitHubAdapter for web');
        }

        this._initialized = true;
    }

    get isInitialized(): boolean {
        return this._initialized;
    }


    static getInstance(): StorageManager {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }

    registerAdapter(adapter: StorageAdapter) {
        this.adapters.set(adapter.type, adapter);
    }

    getAdapter(type: StorageType): StorageAdapter | undefined {
        return this.adapters.get(type);
    }

    getAllAdapters(): StorageAdapter[] {
        return Array.from(this.adapters.values());
    }

    get currentAdapter(): StorageAdapter {
        return this._currentAdapter;
    }

    async openExternalProject(owner: string, repo: string, projectId: string) {
        const githubAdapter = this.getAdapter('github') as GitHubAdapter;
        if (!githubAdapter) {
            throw new Error('GitHub adapter not found');
        }

        // We don't check for 'current user' here as load handles external repos
        return githubAdapter.load(projectId, owner, repo);
    }

    setAdapter(type: StorageType) {
        const adapter = this.adapters.get(type);
        if (!adapter) {
            throw new Error(`Adapter ${type} not found`);
        }

        // In a real app, logic here to ensure auth before switching
        // or auto-trigger connect
        this._currentAdapter = adapter;
        console.log(`[StorageManager] Switched to ${adapter.name}`);
    }
}

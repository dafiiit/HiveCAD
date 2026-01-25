import { StorageAdapter, StorageType } from './types';
import { GitHubAdapter } from './adapters/GitHubAdapter';

export class StorageManager {
    private static instance: StorageManager;
    private adapters: Map<StorageType, StorageAdapter> = new Map();
    private _currentAdapter: StorageAdapter;

    private constructor() {
        // Only GitHub is used in the federated architecture
        this.registerAdapter(new GitHubAdapter());

        // Set default
        this._currentAdapter = this.adapters.get('github')!;
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

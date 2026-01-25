import { StorageAdapter, StorageType } from './types';
import { PublicAdapter } from './adapters/PublicAdapter';
import { GitHubAdapter } from './adapters/GitHubAdapter';
import { GoogleDriveAdapter } from './adapters/GoogleDriveAdapter';

export class StorageManager {
    private static instance: StorageManager;
    private adapters: Map<StorageType, StorageAdapter> = new Map();
    private _currentAdapter: StorageAdapter;

    private constructor() {
        // Register default adapters
        this.registerAdapter(new PublicAdapter());
        this.registerAdapter(new GitHubAdapter());
        this.registerAdapter(new GoogleDriveAdapter());

        // Set default
        this._currentAdapter = this.adapters.get('public')!;
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

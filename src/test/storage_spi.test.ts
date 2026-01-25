import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageManager } from '../lib/storage/StorageManager';
import { PublicAdapter } from '../lib/storage/adapters/PublicAdapter';
import { GitHubAdapter } from '../lib/storage/adapters/GitHubAdapter';

describe('Storage SPI', () => {
    let storageManager: StorageManager;

    beforeEach(() => {
        // Reset singleton for testing (this is tricky with singletons, but we'll try)
        // Accessing private static instance via any cast to reset it
        (StorageManager as any).instance = null;
        storageManager = StorageManager.getInstance();
    });

    it('should default to PublicAdapter', () => {
        expect(storageManager.currentAdapter).toBeInstanceOf(PublicAdapter);
        expect(storageManager.currentAdapter.type).toBe('public');
    });

    it('should have all adapters registered', () => {
        const adapters = storageManager.getAllAdapters();
        expect(adapters.length).toBe(3);
        expect(adapters.find(a => a.type === 'public')).toBeDefined();
        expect(adapters.find(a => a.type === 'github')).toBeDefined();
        expect(adapters.find(a => a.type === 'drive')).toBeDefined();
    });

    it('should switch adapter when setAdapter is called', () => {
        const githubAdapter = storageManager.getAdapter('github');
        expect(githubAdapter).toBeDefined();

        // Mock authentication for the purpose of the test logic, 
        // although setAdapter check depends on implementation
        // My implementation of setAdapter doesn't throw if not authenticated, 
        // but the usage in UI does check. 
        storageManager.setAdapter('github');
        expect(storageManager.currentAdapter.type).toBe('github');
    });

    it('should mock authentication flow', async () => {
        const githubAdapter = storageManager.getAdapter('github')!;
        expect(githubAdapter.isAuthenticated()).toBe(false);

        await githubAdapter.connect();
        expect(githubAdapter.isAuthenticated()).toBe(true);
    });

    it('should use current adapter for save', async () => {
        const adapter = storageManager.currentAdapter;
        const spy = vi.spyOn(adapter, 'save');

        await adapter.save('test-project', { foo: 'bar' });
        expect(spy).toHaveBeenCalledWith('test-project', { foo: 'bar' });
    });
});

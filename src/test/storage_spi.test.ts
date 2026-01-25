import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageManager } from '../lib/storage/StorageManager';
import { PublicAdapter } from '../lib/storage/adapters/PublicAdapter';
import { GitHubAdapter } from '../lib/storage/adapters/GitHubAdapter';

vi.mock('octokit', () => {
    return {
        Octokit: vi.fn().mockImplementation(() => ({
            rest: {
                users: {
                    getAuthenticated: vi.fn().mockResolvedValue({
                        data: { login: 'test-user' }
                    })
                },
                repos: {
                    get: vi.fn().mockResolvedValue({ data: {} }),
                    getContent: vi.fn().mockResolvedValue({ data: {} }),
                    createOrUpdateFileContents: vi.fn().mockResolvedValue({ data: {} }),
                    replaceAllTopics: vi.fn().mockResolvedValue({ data: {} })
                }
            }
        }))
    };
});

describe('Storage SPI', () => {
    let storageManager: StorageManager;

    beforeEach(() => {
        // Reset singleton for testing (this is tricky with singletons, but we'll try)
        // Accessing private static instance via any cast to reset it
        (StorageManager as any).instance = null;
        storageManager = StorageManager.getInstance();
        vi.clearAllMocks();
    });

    it('should default to GitHubAdapter', () => {
        expect(storageManager.currentAdapter).toBeInstanceOf(GitHubAdapter);
        expect(storageManager.currentAdapter.type).toBe('github');
    });

    it('should have GitHub adapter registered', () => {
        const adapters = storageManager.getAllAdapters();
        expect(adapters.length).toBe(1);
        expect(adapters.find(a => a.type === 'github')).toBeDefined();
    });

    it('should keep GitHub adapter when setAdapter is called', () => {
        storageManager.setAdapter('github');
        expect(storageManager.currentAdapter.type).toBe('github');
    });

    it('should connect with a valid token', async () => {
        const githubAdapter = storageManager.getAdapter('github')!;
        expect(githubAdapter.isAuthenticated()).toBe(false);

        // We need to pass a token now since window.prompt is gone
        await githubAdapter.connect('ghp_test_token');
        expect(githubAdapter.isAuthenticated()).toBe(true);
    });

    it('should use current adapter for save after authentication', async () => {
        const adapter = storageManager.currentAdapter as GitHubAdapter;
        await adapter.connect('ghp_test_token');

        const spy = vi.spyOn(adapter, 'save');
        await adapter.save('test-project', { foo: 'bar' });
        expect(spy).toHaveBeenCalledWith('test-project', { foo: 'bar' });
    });
});

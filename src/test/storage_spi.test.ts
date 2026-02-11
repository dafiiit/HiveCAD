import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageManager } from '../lib/storage/StorageManager';

describe('StorageManager', () => {
    beforeEach(() => {
        // Reset singleton for testing
        (StorageManager as any).instance = null;
    });

    it('should return a singleton instance', () => {
        const a = StorageManager.getInstance();
        const b = StorageManager.getInstance();
        expect(a).toBe(b);
    });

    it('should start uninitialized', () => {
        const mgr = StorageManager.getInstance();
        expect(mgr.isInitialized).toBe(false);
    });

    it('should throw when accessing quickStore before init', () => {
        const mgr = StorageManager.getInstance();
        expect(() => mgr.quickStore).toThrow('StorageManager not initialized');
    });

    it('should report remote as not connected by default', () => {
        const mgr = StorageManager.getInstance();
        expect(mgr.isRemoteConnected).toBe(false);
    });

    it('should return null for optional stores before init', () => {
        const mgr = StorageManager.getInstance();
        expect(mgr.remoteStore).toBeNull();
        expect(mgr.supabaseMeta).toBeNull();
        expect(mgr.syncEngine).toBeNull();
    });
});

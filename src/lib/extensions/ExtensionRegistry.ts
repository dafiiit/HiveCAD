import type { Extension, ExtensionManifest } from './Extension';

/**
 * Central registry for extension discovery and management.
 * 
 * The ExtensionRegistry is the core of the plugin architecture:
 * - Extensions register themselves on load
 * - UI components query the registry for icons, labels, tools
 * - No hardcoded maps needed in UI components
 */
export class ExtensionRegistry {
    private extensions: Map<string, Extension> = new Map();
    private listeners: Set<() => void> = new Set();

    /**
     * Register an extension with the registry
     */
    register(extension: Extension): void {
        const id = extension.manifest.id;

        if (this.extensions.has(id)) {
            console.warn(`Extension "${id}" is already registered. Overwriting.`);
        }

        this.extensions.set(id, extension);

        // Call lifecycle hook
        extension.onRegister?.();

        // Notify listeners
        this.notifyListeners();
    }

    /**
     * Unregister an extension
     */
    unregister(id: string): void {
        const extension = this.extensions.get(id);
        if (extension) {
            extension.onUnregister?.();
            this.extensions.delete(id);
            this.notifyListeners();
        }
    }

    /**
     * Get an extension by ID
     */
    get(id: string): Extension | undefined {
        return this.extensions.get(id);
    }

    /**
     * Check if an extension exists
     */
    has(id: string): boolean {
        return this.extensions.has(id);
    }

    /**
     * Get all registered extensions
     */
    getAll(): Extension[] {
        return Array.from(this.extensions.values());
    }

    /**
     * Get extensions by category
     */
    getByCategory(category: string): Extension[] {
        return Array.from(this.extensions.values()).filter(
            ext => ext.manifest.category === category
        );
    }

    /**
     * Get extensions by group (for dropdown grouping)
     */
    getByGroup(group: string): Extension[] {
        return Array.from(this.extensions.values()).filter(
            ext => ext.manifest.group === group
        );
    }

    /**
     * Get all extension IDs
     */
    getAllIds(): string[] {
        return Array.from(this.extensions.keys());
    }

    /**
     * Get all manifests for UI rendering
     */
    getAllManifests(): ExtensionManifest[] {
        return Array.from(this.extensions.values()).map(ext => ext.manifest);
    }

    // ===== Convenience accessors for UI components =====

    /**
     * Get icon name for an extension (for registry-driven UI)
     */
    getIcon(id: string): string {
        return this.extensions.get(id)?.manifest.icon || 'Package';
    }

    /**
     * Get display label for an extension
     */
    getLabel(id: string): string {
        return this.extensions.get(id)?.manifest.name || id;
    }

    /**
     * Get manifest for an extension
     */
    getManifest(id: string): ExtensionManifest | undefined {
        return this.extensions.get(id)?.manifest;
    }

    /**
     * Get number of registered extensions
     */
    get size(): number {
        return this.extensions.size;
    }

    /**
     * Clear all extensions (useful for testing)
     */
    clear(): void {
        // Call unregister hooks
        for (const ext of this.extensions.values()) {
            ext.onUnregister?.();
        }
        this.extensions.clear();
        this.notifyListeners();
    }

    // ===== Subscription for reactive updates =====

    /**
     * Subscribe to registry changes
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}

// Singleton instance for global access
export const extensionRegistry = new ExtensionRegistry();

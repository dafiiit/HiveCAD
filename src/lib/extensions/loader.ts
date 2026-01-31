import { extensionRegistry } from './ExtensionRegistry';
import { toolToExtension } from './Extension';

// Import all existing tools from the tools directory (which now exports everything from core)
import { allCoreTools } from '../tools';

/**
 * Load all built-in extensions (migrated from existing tools)
 * This is called once on app startup to populate the registry
 */
export function loadBuiltinExtensions(): void {
    // Register each tool as an extension
    for (const tool of allCoreTools) {
        const extension = toolToExtension(tool);
        extensionRegistry.register(extension);
    }

    console.log(`[ExtensionLoader] Registered ${extensionRegistry.size} built-in extensions`);
}

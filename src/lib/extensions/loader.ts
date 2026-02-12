import { extensionRegistry } from './ExtensionRegistry';
import { toolToExtension } from './Extension';

// Import all existing tools from the tools directory (which now exports everything from core)
import { allCoreTools } from '../tools';

/**
 * Load all built-in extensions (migrated from existing tools)
 * This is called once on app startup to populate the extension registry
 * with manifests. Tools are already registered in the ToolRegistry
 * via lib/tools/index.ts — we only register manifests here.
 */
export function loadBuiltinExtensions(): void {
    // Register each tool's manifest as an extension (tools already in ToolRegistry)
    for (const tool of allCoreTools) {
        const extension = toolToExtension(tool);
        extensionRegistry.register(extension);
    }

    console.log(`[ExtensionLoader] Registered ${extensionRegistry.size} built-in extension manifests`);
}

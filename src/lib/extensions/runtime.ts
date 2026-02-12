import type { Extension } from './Extension';
import { extensionRegistry } from './ExtensionRegistry';
import { toolRegistry } from '../tools/registry';

interface ExtensionModule {
    extension?: Extension;
    default?: Extension;
}

const localExtensionImporters = import.meta.glob('../../extensions/*/index.ts');

/**
 * Register an extension: tool goes to ToolRegistry, manifest goes to ExtensionRegistry.
 * No dual storage — each registry owns its domain.
 */
export const registerExtension = (extension: Extension): void => {
    // Register manifest/metadata only in the extension registry
    extensionRegistry.register(extension);
    // Register the tool (if any) only in the tool registry
    if (extension.tool) {
        toolRegistry.register(extension.tool);
    }
};

export const loadLocalExtensionById = async (extensionId: string): Promise<Extension | null> => {
    const matchKey = Object.keys(localExtensionImporters).find((path) =>
        path.includes(`/extensions/${extensionId}/index.ts`)
    );

    if (!matchKey) return null;

    try {
        const mod = await localExtensionImporters[matchKey]();
        const extension = (mod as ExtensionModule).extension ?? (mod as ExtensionModule).default;
        if (!extension) return null;

        registerExtension(extension);
        return extension;
    } catch (error) {
        console.error(`[ExtensionLoader] Failed to load ${extensionId}:`, error);
        return null;
    }
};

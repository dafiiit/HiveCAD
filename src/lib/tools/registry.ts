import type { Tool, ToolCategory, ToolMetadata, ToolUIProperty } from './types';

/**
 * Central registry for tool discovery and execution.
 * Tools register themselves, and consumers query by ID or category.
 */
export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    /**
     * Register a tool with the registry
     */
    register(tool: Tool): void {
        if (this.tools.has(tool.metadata.id)) {
            console.warn(`Tool "${tool.metadata.id}" is already registered. Overwriting.`);
        }
        this.tools.set(tool.metadata.id, tool);
    }

    /**
     * Get a tool by its ID
     */
    get(id: string): Tool | undefined {
        return this.tools.get(id);
    }

    /**
     * Check if a tool exists
     */
    has(id: string): boolean {
        return this.tools.has(id);
    }

    /**
     * Get all tools in a specific category
     */
    getByCategory(category: ToolCategory): Tool[] {
        return Array.from(this.tools.values()).filter(
            tool => tool.metadata.category === category
        );
    }

    /**
     * Get all tools in a specific group (e.g., 'Line' group for dropdowns)
     */
    getByGroup(group: string): Tool[] {
        return Array.from(this.tools.values()).filter(
            tool => tool.metadata.group === group
        );
    }

    /**
     * Get metadata for all registered tools
     */
    getAllMetadata(): ToolMetadata[] {
        return Array.from(this.tools.values()).map(tool => tool.metadata);
    }

    /**
     * Get all registered tool IDs
     */
    getAllIds(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * Get default parameters for a tool based on its UI properties
     */
    getDefaultParams(id: string): Record<string, any> {
        const tool = this.tools.get(id);
        if (!tool) return {};

        const defaults: Record<string, any> = {};
        for (const prop of tool.uiProperties) {
            defaults[prop.key] = prop.default;
        }
        return defaults;
    }

    /**
     * Get UI properties for a tool
     */
    getUIProperties(id: string): ToolUIProperty[] {
        const tool = this.tools.get(id);
        return tool?.uiProperties || [];
    }

    /**
     * Check if a tool requires a dialog (has UI properties)
     */
    requiresDialog(id: string): boolean {
        const tool = this.tools.get(id);
        return tool ? tool.uiProperties.length > 0 : false;
    }

    /**
     * Get all tools that require dialogs
     */
    getDialogTools(): Tool[] {
        return Array.from(this.tools.values()).filter(
            tool => tool.uiProperties.length > 0
        );
    }

    /**
     * Get tool metadata
     */
    getMetadata(id: string): ToolMetadata | undefined {
        const tool = this.tools.get(id);
        return tool?.metadata;
    }

    /**
     * Get all registered tools
     */
    getAll(): Tool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get the total number of registered tools
     */
    get size(): number {
        return this.tools.size;
    }

    /**
     * Clear all registered tools (useful for testing)
     */
    clear(): void {
        this.tools.clear();
    }
}

// Singleton instance for global access
export const toolRegistry = new ToolRegistry();

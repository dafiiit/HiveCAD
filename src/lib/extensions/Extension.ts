import type { Tool, ToolCategory } from '../tools/types';

/**
 * Extension manifest - metadata for an extension
 */
export interface ExtensionManifest {
    /** Unique identifier for the extension */
    id: string;
    /** Display name */
    name: string;
    /** Semantic version */
    version: string;
    /** Description of what the extension does */
    description: string;
    /** Author name or organization */
    author: string;
    /** Lucide icon name */
    icon: string;
    /** Category for organization */
    category: ToolCategory | 'modifier' | 'utility';
    /** Optional keyboard shortcut */
    shortcut?: string;
    /** Group for dropdown organization (e.g., 'Shape' for circle, rectangle) */
    group?: string;
}

/**
 * Schema definition for extension-specific data stored on CADObjects
 */
export interface ExtensionDataSchema {
    /** JSON Schema for validation */
    properties: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        default?: any;
        description?: string;
    }>;
    /** Required property names */
    required?: string[];
}

/**
 * Extension interface - unifies tools, data schemas, and lifecycle hooks
 * 
 * Extensions are self-contained units that can:
 * - Provide tools for the toolbar
 * - Define custom data schemas for CADObjects
 * - Register lifecycle hooks
 */
export interface Extension {
    /** Extension metadata */
    manifest: ExtensionManifest;

    /**
     * Tool capabilities - if provided, this extension adds a tool to the toolbar
     * The tool inherits metadata from the manifest unless overridden
     */
    tool?: Tool;

    /**
     * Data schema for extension-specific data stored on CADObjects
     * When a CADObject is created by this extension, it can store data
     * in `object.extensionData[extensionId]`
     */
    dataSchema?: ExtensionDataSchema;

    /**
     * Called when the extension is registered with the system
     */
    onRegister?: () => void;

    /**
     * Called when the extension is unregistered
     */
    onUnregister?: () => void;
}

/**
 * Convert an Extension manifest to Tool metadata
 * This ensures tools created from extensions have proper metadata
 */
export function manifestToToolMetadata(manifest: ExtensionManifest): Tool['metadata'] {
    return {
        id: manifest.id,
        label: manifest.name,
        icon: manifest.icon,
        category: manifest.category as ToolCategory,
        description: manifest.description,
        shortcut: manifest.shortcut,
        group: manifest.group,
    };
}

/**
 * Helper to create an extension from an existing Tool
 * Used for migrating existing tools to the extension system
 */
export function toolToExtension(tool: Tool): Extension {
    return {
        manifest: {
            id: tool.metadata.id,
            name: tool.metadata.label,
            version: '1.0.0',
            description: tool.metadata.description || '',
            author: 'HiveCAD',
            icon: tool.metadata.icon,
            category: tool.metadata.category,
            shortcut: tool.metadata.shortcut,
            group: tool.metadata.group,
        },
        tool,
    };
}

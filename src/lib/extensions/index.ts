/**
 * Extension System - Core exports
 * 
 * This module provides the plugin architecture for HiveCAD:
 * - Extensions are self-contained units that add tools and functionality
 * - The ExtensionRegistry manages registration and lookup
 * - UI components query the registry instead of using hardcoded maps
 */

// Core types
export type { Extension, ExtensionManifest, ExtensionDataSchema } from './Extension';

// Helper functions
export { toolToExtension, manifestToToolMetadata } from './Extension';

// Registry
export { ExtensionRegistry, extensionRegistry } from './ExtensionRegistry';

// Loader
export { loadBuiltinExtensions } from './loader';

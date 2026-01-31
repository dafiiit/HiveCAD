/**
 * Tool Registry - Central exports for the tool system
 * 
 * This module provides the unified tool registration system for HiveCAD.
 * All core tools are imported from the new folder structure in ./core/
 */

import { toolRegistry } from './registry';
import { allCoreTools } from './core';

// Registers all core tools automatically
allCoreTools.forEach(tool => toolRegistry.register(tool));

// Export registry and types
export { toolRegistry };
export type { Tool, ToolMetadata, ToolCategory, ToolUIProperty, SketchPrimitiveData } from './types';
export { generateToolId } from './types';

// Re-export all core tools for direct access
export * from './core';

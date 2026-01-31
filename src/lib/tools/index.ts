/**
 * Tool Registry - Central exports for the tool system
 * 
 * This module provides the unified tool registration system for HiveCAD.
 * All core tools are imported from the new folder structure in ./core/
 * 
 * Tool Organization:
 * - Each tool has its own folder: core/{category}/{tool-name}/index.ts
 * - Tools are grouped by category (primitive, operation, boolean, modify, etc.)
 * - This structure mirrors the extension system for consistency
 */

import { toolRegistry } from './registry';

// Import all core tools from the new structure
import {
    // Primitive tools
    boxTool,
    cylinderTool,
    sphereTool,
    torusTool,
    coilTool,
    // Operation tools
    extrusionTool,
    revolveTool,
    pivotTool,
    translatePlaneTool,
    // Boolean tools
    joinTool,
    cutTool,
    intersectTool,
    // Modify tools
    moveTool,
    rotateTool,
    scaleTool,
    duplicateTool,
    deleteTool,
    // Configure tools
    parametersTool,
    patternTool,
    // Construct tools
    planeTool,
    axisTool,
    pointTool,
    // Inspect tools
    measureTool,
    analyzeTool,
    // Navigation tools
    selectTool,
    panTool,
    orbitTool,
    sketchTool
} from './core';

// Import sketch tools (these remain in their current location for now due to complexity)
import {
    lineTool,
    threePointsArcTool, tangentArcTool, sagittaArcTool, ellipseTool,
    smoothSplineTool, bezierTool, quadraticBezierTool, cubicBezierTool,
    rectangleTool, roundedRectangleTool, circleTool, polygonTool, textTool
} from './sketch';

// Auto-register all core tools
const coreTools = [
    // Primitives
    boxTool, cylinderTool, sphereTool, torusTool, coilTool,
    // Operations
    extrusionTool, revolveTool, pivotTool, translatePlaneTool,
    // Boolean
    joinTool, cutTool, intersectTool,
    // Modify
    moveTool, rotateTool, scaleTool, duplicateTool, deleteTool,
    // Configure
    parametersTool, patternTool,
    // Construct
    planeTool, axisTool, pointTool,
    // Inspect
    measureTool, analyzeTool,
    // Navigation
    selectTool, panTool, orbitTool, sketchTool
];

// Auto-register sketch tools
const sketchTools = [
    lineTool,
    threePointsArcTool, tangentArcTool, sagittaArcTool, ellipseTool,
    smoothSplineTool, bezierTool, quadraticBezierTool, cubicBezierTool,
    rectangleTool, roundedRectangleTool, circleTool, polygonTool, textTool
];

// Register all tools
[...coreTools, ...sketchTools].forEach(tool => toolRegistry.register(tool));

// Export registry and types
export { toolRegistry };
export type { Tool, ToolMetadata, ToolCategory, ToolUIProperty, SketchPrimitiveData } from './types';
export { generateToolId } from './types';

// Re-export all core tools for direct access
export * from './core';

// Re-export sketch tools
export * from './sketch';

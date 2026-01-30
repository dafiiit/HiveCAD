// Tool Registry - Central exports for the tool system
import { toolRegistry } from './registry';

// Import all tools for auto-registration
// Primitives
import { boxTool, cylinderTool, sphereTool, torusTool, coilTool, planeTool } from './primitives';

// Sketch tools
import {
    lineTool,
    threePointsArcTool, tangentArcTool, sagittaArcTool, ellipseTool,
    smoothSplineTool, bezierTool, quadraticBezierTool, cubicBezierTool,
    rectangleTool, roundedRectangleTool, circleTool, polygonTool, textTool
} from './sketch';

// Operations
import { extrusionTool, revolveTool, pivotTool, translatePlaneTool } from './operations';

// Boolean operations
import { joinTool, cutTool, intersectTool } from './boolean';

// Navigation tools
import { selectTool, panTool, orbitTool, measureTool, sketchTool } from './navigation';

// Auto-register all tools
const allTools = [
    // Primitives
    boxTool, cylinderTool, sphereTool, torusTool, coilTool, planeTool,
    // Sketch - Lines
    lineTool,
    // Sketch - Arcs
    threePointsArcTool, tangentArcTool, sagittaArcTool, ellipseTool,
    // Sketch - Splines
    smoothSplineTool, bezierTool, quadraticBezierTool, cubicBezierTool,
    // Sketch - Shapes
    rectangleTool, roundedRectangleTool, circleTool, polygonTool, textTool,
    // Operations
    extrusionTool, revolveTool, pivotTool, translatePlaneTool,
    // Boolean
    joinTool, cutTool, intersectTool,
    // Navigation
    selectTool, panTool, orbitTool, measureTool, sketchTool
];

allTools.forEach(tool => toolRegistry.register(tool));

// Export registry and types
export { toolRegistry };
export type { Tool, ToolMetadata, ToolCategory, ToolUIProperty, SketchPrimitiveData } from './types';
export { generateToolId } from './types';

// Export individual tools for direct access if needed
export * from './primitives';
export * from './sketch';
export * from './operations';
export * from './boolean';
export * from './navigation';

import { extensionRegistry } from './ExtensionRegistry';
import { toolToExtension } from './Extension';

// Import all existing tools from the tools directory
import {
    boxTool, cylinderTool, sphereTool, torusTool, coilTool, planeTool
} from '../tools/primitives';
import {
    lineTool,
    threePointsArcTool, tangentArcTool, sagittaArcTool, ellipseTool,
    smoothSplineTool, bezierTool, quadraticBezierTool, cubicBezierTool,
    rectangleTool, roundedRectangleTool, circleTool, polygonTool, textTool
} from '../tools/sketch';
import { extrusionTool, revolveTool, pivotTool, translatePlaneTool } from '../tools/operations';
import { joinTool, cutTool, intersectTool } from '../tools/boolean';
import { selectTool, panTool, orbitTool, measureTool, sketchTool } from '../tools/navigation';

/**
 * Load all built-in extensions (migrated from existing tools)
 * This is called once on app startup to populate the registry
 */
export function loadBuiltinExtensions(): void {
    // All existing tools converted to extensions
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

    // Register each tool as an extension
    for (const tool of allTools) {
        const extension = toolToExtension(tool);
        extensionRegistry.register(extension);
    }

    console.log(`[ExtensionLoader] Registered ${extensionRegistry.size} built-in extensions`);
}

/**
 * Core Tools Index
 * 
 * This module exports all core/builtin tools organized by category.
 * Each tool follows the extension-compatible structure with its own folder.
 */

import { boxTool, cylinderTool, sphereTool, torusTool, coilTool } from './primitive';
import { extrusionTool, revolveTool, pivotTool, translatePlaneTool } from './operation';
import { joinTool, cutTool, intersectTool } from './boolean';
import { moveTool, rotateTool, scaleTool, duplicateTool, deleteTool } from './modify';
import { parametersTool, patternTool } from './configure';
import { planeTool, axisTool, pointTool } from './construct';
import { measureTool, analyzeTool } from './inspect';
import { selectTool, panTool, orbitTool, sketchTool } from './navigation';
import {
    lineTool,
    threePointsArcTool, tangentArcTool, sagittaArcTool, ellipseTool,
    smoothSplineTool, bezierTool, quadraticBezierTool, cubicBezierTool,
    rectangleTool, roundedRectangleTool, circleTool, polygonTool, textTool
} from './sketch';

// Re-export all categories
export * from './primitive';
export * from './operation';
export * from './boolean';
export * from './modify';
export * from './configure';
export * from './construct';
export * from './inspect';
export * from './navigation';
export * from './sketch';

// Export aggregated list of all core tools for easy registration
export const allCoreTools = [
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
    selectTool, panTool, orbitTool, sketchTool,
    // Sketch
    lineTool,
    threePointsArcTool, tangentArcTool, sagittaArcTool, ellipseTool,
    smoothSplineTool, bezierTool, quadraticBezierTool, cubicBezierTool,
    rectangleTool, roundedRectangleTool, circleTool, polygonTool, textTool
];

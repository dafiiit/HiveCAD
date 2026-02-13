/**
 * Core Tools Index
 * 
 * This module exports all core/builtin tools organized by category.
 * Each tool follows the extension-compatible structure with its own folder.
 */

import { boxTool, cylinderTool, sphereTool, torusTool, coilTool } from './primitive';
import { extrusionTool, revolveTool, pivotTool, translatePlaneTool } from './operation';
import { joinTool, cutTool, intersectTool } from './boolean';
import { moveTool, rotateTool, scaleTool, duplicateTool, deleteTool, toggleConstructionTool, trimTool, offsetTool, mirrorTool, dimensionTool } from './modify';
import { parametersTool, patternTool } from './configure';
import { planeTool, axisTool, pointTool } from './construct';
import { measureTool, analyzeTool } from './inspect';
import { selectTool, panTool, orbitTool, sketchTool } from './navigation';
import {
    lineTool,
    threePointsArcTool,
    smoothSplineTool, bezierTool, quadraticBezierTool, cubicBezierTool,
    rectangleTool, roundedRectangleTool, circleTool, polygonTool, textTool, ellipseTool,
    constructionLineTool,
    sketchPointTool,
} from './sketch';
import {
    equalTool, coincidentTool, tangentTool,
    horizontalTool, verticalTool,
    parallelTool, perpendicularTool,
    symmetricTool, midpointTool,
    concentricTool, collinearTool,
    fixedTool,
    pointOnLineTool, pointOnCircleTool,
    equalRadiusTool,
} from './constrain';

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
export * from './constrain';

// Export aggregated list of all core tools for easy registration
export const allCoreTools = [
    // Primitives
    boxTool, cylinderTool, sphereTool, torusTool, coilTool,
    // Operations
    extrusionTool, revolveTool, pivotTool, translatePlaneTool,
    // Boolean
    joinTool, cutTool, intersectTool,
    // Modify
    moveTool, rotateTool, scaleTool, duplicateTool, deleteTool, trimTool, offsetTool, mirrorTool,
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
    threePointsArcTool,
    smoothSplineTool, bezierTool, quadraticBezierTool, cubicBezierTool,
    rectangleTool, roundedRectangleTool, circleTool, polygonTool, textTool, ellipseTool,
    // Construction & Dimension
    constructionLineTool, toggleConstructionTool, dimensionTool,
    // Sketch Point
    sketchPointTool,
    // Constraints
    equalTool, coincidentTool, tangentTool,
    horizontalTool, verticalTool,
    parallelTool, perpendicularTool,
    symmetricTool, midpointTool,
    concentricTool, collinearTool,
    fixedTool,
    pointOnLineTool, pointOnCircleTool,
    equalRadiusTool,
];

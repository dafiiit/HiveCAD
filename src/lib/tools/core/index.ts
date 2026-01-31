/**
 * Core Tools Index
 * 
 * This module exports all core/builtin tools organized by category.
 * Each tool follows the extension-compatible structure with its own folder.
 * 
 * Categories:
 * - primitive: Basic 3D shapes (box, cylinder, sphere, etc.)
 * - operation: 3D operations (extrude, revolve, etc.)
 * - boolean: Boolean operations (join, cut, intersect)
 * - modify: Transform operations (move, rotate, scale, duplicate, delete)
 * - configure: Configuration tools (parameters, pattern)
 * - construct: Reference geometry (plane, axis, point)
 * - inspect: Measurement and analysis (measure, analyze)
 * - navigation: View and selection tools (select, pan, orbit, sketch)
 */

// Primitive tools
export * from './primitive';

// Operation tools
export * from './operation';

// Boolean tools
export * from './boolean';

// Modify tools
export * from './modify';

// Configure tools
export * from './configure';

// Construct tools
export * from './construct';

// Inspect tools
export * from './inspect';

// Navigation tools
export * from './navigation';

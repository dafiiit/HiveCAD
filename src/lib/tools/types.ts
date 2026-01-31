import type { CodeManager } from '../code-manager';
import type * as THREE from 'three';
import type { ReactNode } from 'react';
import type { CADObject } from '../../store/types';

// Re-export SketchPrimitive type for tools to use
export type SketchPlane = 'XY' | 'XZ' | 'YZ';

// Minimal SketchPrimitive type for tools (matches useCADStore.SketchPrimitive)
export interface SketchPrimitive {
    id: string;
    type: string;
    points: [number, number][];
    properties?: Record<string, any>;
}

// Tool categories for organization and filtering
export type ToolCategory =
    | 'primitive'   // Box, Cylinder, Sphere, etc.
    | 'sketch'      // Line, Arc, Circle, etc.
    | 'operation'   // Extrude, Revolve, Fillet, etc.
    | 'modify'      // Move, Rotate, Scale, etc.
    | 'navigation'  // Select, Pan, Orbit
    | 'boolean'     // Join, Cut, Intersect
    | 'construct';  // Plane, Axis, Point

// Tool metadata for UI rendering
export interface ToolMetadata {
    id: string;
    label: string;
    icon: string; // Lucide icon name (e.g., 'Box', 'Circle', 'Minus')
    category: ToolCategory;
    description?: string;
    shortcut?: string;
    group?: string; // For dropdown grouping (e.g., 'Line' group contains vline, hline)
}

// UI property definitions for OperationProperties panel
export interface ToolUIProperty {
    key: string;
    label: string;
    type: 'number' | 'boolean' | 'select' | 'text' | 'selection';
    default: any;
    unit?: 'mm' | 'deg' | '%';
    options?: { value: string; label: string }[]; // For select type
    min?: number;
    max?: number;
    step?: number;
    allowedTypes?: string[]; // For selection type: filter what can be selected
}

// Sketch primitive data (matches existing SketchPrimitive in useCADStore)
export interface SketchPrimitiveData {
    id: string;
    type: string;
    points: [number, number][];
    properties?: Record<string, any>;
}

// Tool selection requirements
export interface SelectionRequirements {
    min?: number;
    max?: number;
    allowedTypes?: ('sketch' | 'face' | 'solid' | 'edge' | 'datumAxis' | 'other')[]; // Map to CADObject types
}

// Base Tool interface - all tools implement this
export interface Tool {
    metadata: ToolMetadata;
    uiProperties: ToolUIProperty[];
    selectionRequirements?: SelectionRequirements;


    /**
     * Create geometry (for primitive tools like box, cylinder, sphere)
     * @param codeManager - CodeManager instance for AST manipulation
     * @param params - Tool parameters from UI
     * @returns The feature ID/name created in the code
     */
    create?(codeManager: CodeManager, params: Record<string, any>): string;

    /**
     * Add sketch primitive to an existing sketch (for sketch tools)
     * @param codeManager - CodeManager instance
     * @param sketchName - Name of the sketch feature to add to
     * @param primitive - The sketch primitive data
     */
    addToSketch?(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void;

    /**
     * Execute operation on selected objects (for modify/boolean tools)
     * @param codeManager - CodeManager instance
     * @param selectedIds - Currently selected object IDs
     * @param params - Operation parameters
     */
    execute?(codeManager: CodeManager, selectedIds: string[], params: Record<string, any>): void;

    /**
     * Process points into a sketch primitive (for interactive sketch drawing)
     * @param points - Array of 2D points from user input
     * @param properties - Additional properties from UI (e.g., radius, sides)
     * @returns A SketchPrimitiveData object
     */
    processPoints?(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData;

    /**
     * Create a standalone shape wrapper (for circle, rectangle, polygon that use draw* helpers)
     * @param codeManager - CodeManager instance
     * @param primitive - The sketch primitive data
     * @param plane - The sketch plane ('XY', 'XZ', 'YZ')
     * @returns The feature ID/name created
     */
    createShape?(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string;

    /**
     * Render the preview geometry while drawing (replaces switch in SketchCanvas.renderPrimitive)
     * @param primitive - The sketch primitive being drawn
     * @param to3D - Function to convert 2D sketch coords to 3D world coords
     * @param isGhost - Whether this is the active drawing (ghost) or committed primitive
     * @returns React/Three.js nodes to render
     */
    renderPreview?(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost?: boolean
    ): ReactNode;

    /**
     * Render annotation overlays (dimensions, guides) for this tool
     * @param primitive - The sketch primitive being annotated
     * @param plane - The sketch plane for coordinate context
     * @param lockedValues - Any locked dimension values from UI
     * @returns React/Three.js nodes to render as overlays
     */
    renderAnnotation?(
        primitive: SketchPrimitive,
        plane: SketchPlane,
        lockedValues?: Record<string, number | null>,
        dimMode?: 'aligned' | 'horizontal' | 'vertical'
    ): ReactNode;

    /**
     * Render the 3D preview of an operation (e.g., Extrude ghost)
     * This replaces the hardcoded OperationPreview in Viewport.tsx
     * @param params - Operation parameters from UI
     * @param context - Current selection and objects context
     * @returns React/Three.js nodes to render as 3D preview
     */
    render3DPreview?(
        params: Record<string, any>,
        context: {
            selectedIds: string[];
            objects: CADObject[];
        }
    ): ReactNode;

    /**
     * Create the initial primitive state when starting to draw
     * @param startPoint - The 2D point where drawing started
     * @param properties - Optional properties from dialog or defaults
     * @returns A new SketchPrimitive to use as currentDrawingPrimitive
     */
    createInitialPrimitive?(
        startPoint: [number, number],
        properties?: Record<string, any>
    ): SketchPrimitive;
}

// Helper to generate IDs
export const generateToolId = () => Math.random().toString(36).substr(2, 9);

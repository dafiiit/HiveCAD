import type { CodeManager } from '../code-manager';

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
    type: 'number' | 'boolean' | 'select' | 'text';
    default: any;
    unit?: 'mm' | 'deg' | '%';
    options?: { value: string; label: string }[]; // For select type
    min?: number;
    max?: number;
    step?: number;
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
    allowedTypes?: ('sketch' | 'face' | 'solid' | 'other')[]; // Map to CADObject types
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
}

// Helper to generate IDs
export const generateToolId = () => Math.random().toString(36).substr(2, 9);

/**
 * Snapping Engine Types
 * 
 * Types for the 2D sketch snapping system.
 */

/**
 * Types of snap points that can be detected
 */
export type SnapPointType =
    | 'endpoint'      // End of a line, arc, or spline
    | 'midpoint'      // Middle of a line segment
    | 'center'        // Center of a circle, arc, or polygon
    | 'intersection'  // Where two entities cross
    | 'grid'          // Grid line intersection
    | 'horizontal'    // Virtual horizontal alignment
    | 'vertical'      // Virtual vertical alignment
    | 'extension';    // Extension of an existing line

/**
 * Priority order for snap types (lower = higher priority)
 */
export const SNAP_PRIORITY: Record<SnapPointType, number> = {
    endpoint: 1,
    midpoint: 2,
    center: 3,
    intersection: 4,
    grid: 5,
    horizontal: 6,
    vertical: 6,
    extension: 7,
};

/**
 * A single snap point in the sketch
 */
export interface SnapPoint {
    /** Unique identifier */
    id: string;
    /** X coordinate in sketch space */
    x: number;
    /** Y coordinate in sketch space */
    y: number;
    /** Type of snap point */
    type: SnapPointType;
    /** ID of the source entity (primitive) that created this snap point */
    sourceEntityId?: string;
    /** Priority for this snap point (lower = higher priority) */
    priority: number;
    /** Additional metadata for virtual constraints */
    metadata?: {
        /** For extension snaps: the angle of the extension line */
        angle?: number;
        /** For alignment snaps: the source point being aligned to */
        alignedToPoint?: { x: number; y: number };
    };
}

/**
 * Result from a snap query
 */
export interface SnapResult {
    /** Snapped X coordinate */
    x: number;
    /** Snapped Y coordinate */
    y: number;
    /** The snap point that was matched */
    snapPoint: SnapPoint;
    /** Distance from original position to snap point */
    distance: number;
    /** Visual guide lines to render (for virtual constraints) */
    guideLines?: Array<{
        from: { x: number; y: number };
        to: { x: number; y: number };
        type: 'horizontal' | 'vertical' | 'extension';
    }>;
}

/**
 * Bounds for quadtree regions
 */
export interface QuadtreeBounds {
    x: number;       // Center X
    y: number;       // Center Y
    halfWidth: number;
    halfHeight: number;
}

/**
 * Configuration for the snapping engine
 */
export interface SnappingConfig {
    /** Snap distance threshold in sketch units */
    snapDistance: number;
    /** Whether endpoint snapping is enabled */
    snapToEndpoints: boolean;
    /** Whether midpoint snapping is enabled */
    snapToMidpoints: boolean;
    /** Whether center snapping is enabled */
    snapToCenters: boolean;
    /** Whether grid snapping is enabled */
    snapToGrid: boolean;
    /** Whether virtual constraint snapping is enabled */
    snapToVirtualConstraints: boolean;
    /** Grid size for grid snapping */
    gridSize: number;
}

/**
 * Default snapping configuration
 */
export const DEFAULT_SNAPPING_CONFIG: SnappingConfig = {
    snapDistance: 1.0, // 1 unit in sketch space
    snapToEndpoints: true,
    snapToMidpoints: true,
    snapToCenters: true,
    snapToGrid: false,
    snapToVirtualConstraints: true,
    gridSize: 1.0,
};

/**
 * Generate a unique ID for snap points
 */
export const generateSnapPointId = (): string => {
    return `snap_${Math.random().toString(36).substr(2, 9)}`;
};

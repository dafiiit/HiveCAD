/**
 * Topology Reference System
 * 
 * This module defines how references to topological entities are created and resolved.
 * A TopologyReference can be resolved across model regenerations using:
 * 1. Stable IDs (exact match)
 * 2. Semantic selectors (e.g., "top face", "largest face")
 * 3. Geometric selectors (position, normal, area matching)
 * 
 * The system gracefully degrades from exact to fuzzy matching.
 */

import { TopologyEntityType, GeometricSignature } from './StableId';

// ============================================================================
// Semantic Selectors
// ============================================================================

/**
 * Semantic selector type
 */
export type SemanticSelectorType =
    | 'topmost'              // Face with highest Z centroid
    | 'bottommost'           // Face with lowest Z centroid
    | 'leftmost'            // Face with lowest X centroid
    | 'rightmost'           // Face with highest X centroid
    | 'frontmost'           // Face with highest Y centroid
    | 'backmost'            // Face with lowest Y centroid
    | 'largest'             // Face with largest area
    | 'smallest'            // Face with smallest area
    | 'longest'             // Edge with longest length
    | 'shortest'            // Edge with shortest length
    | 'parallel_to_plane'   // Face/edge parallel to a plane
    | 'perpendicular_to'    // Face/edge perpendicular to a direction
    | 'at_position'         // Entity at or near a position
    | 'nth_from_origin'     // Nth entity when sorted by distance from origin
    | 'contains_point'      // Face that would contain a projected point
    | 'on_plane'            // Entity lying on a specific plane
    | 'within_box';         // Entity within a bounding box

/**
 * Semantic selector for identifying topology by meaning
 */
export interface SemanticSelector {
    type: SemanticSelectorType;

    /** Parameters specific to the selector type */
    params?: {
        /** Direction vector (for parallel_to, perpendicular_to) */
        direction?: [number, number, number];

        /** Position (for at_position, contains_point) */
        position?: [number, number, number];

        /** Tolerance for position matching */
        tolerance?: number;

        /** Plane definition (for on_plane) */
        plane?: {
            origin: [number, number, number];
            normal: [number, number, number];
        };

        /** N value (for nth_from_origin) */
        n?: number;

        /** Bounding box (for within_box) */
        box?: {
            min: [number, number, number];
            max: [number, number, number];
        };
    };
}

// ============================================================================
// Geometric Selectors
// ============================================================================

/**
 * Geometric selector for fuzzy matching by geometric properties
 */
export interface GeometricSelector {
    /** Match by normal direction (within tolerance) */
    normalDirection?: [number, number, number];
    normalTolerance?: number;

    /** Match by centroid position (within tolerance) */
    centroidPosition?: [number, number, number];
    positionTolerance?: number;

    /** Match by axis direction (for cylindrical surfaces, linear edges) */
    axisDirection?: [number, number, number];
    axisTolerance?: number;

    /** Match by area range (for faces) */
    areaRange?: { min?: number; max?: number };

    /** Match by length range (for edges) */
    lengthRange?: { min?: number; max?: number };

    /** Match by surface type (for faces) */
    surfaceType?: string;

    /** Match by curve type (for edges) */
    curveType?: string;

    /** Match by radius (for cylindrical/spherical surfaces, circular edges) */
    radiusRange?: { min?: number; max?: number };

    /** Required minimum edge count (for faces) */
    minEdgeCount?: number;

    /** Required maximum edge count (for faces) */
    maxEdgeCount?: number;
}

// ============================================================================
// Topology Reference
// ============================================================================

/**
 * A reference to a topological entity that can be resolved across regenerations.
 * Uses a priority system for resolution:
 * 1. stableId (exact match)
 * 2. semanticSelector (logical selection)
 * 3. geometricSelector (fuzzy match)
 * 4. indexHint (legacy/last resort)
 */
export interface TopologyReference {
    /** Type of topological element */
    type: TopologyEntityType;

    /** The ID of the base solid/body object (AST variable name) */
    baseObjectId: string;

    /** Primary: Stable ID UUID (persisted, exact match) */
    stableId?: string;

    /** Secondary: Semantic selector for logical selection */
    semanticSelector?: SemanticSelector;

    /** Tertiary: Geometric selector for fuzzy matching */
    geometricSelector?: GeometricSelector;

    /** Fallback: Display-time index (transient, used for initial pick or legacy) */
    indexHint?: number;

    /** Human-readable label for UI display */
    label?: string;

    /** When this reference was created */
    createdAt?: number;

    /** Operation that created this reference */
    sourceOperationId?: string;

    /** Cached resolution result (transient, not serialized) */
    _cached?: {
        resolvedIndex: number;
        resolvedAt: number;
        confidence: number;
    };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a reference from a display-time selection
 */
export function createReferenceFromSelection(
    baseObjectId: string,
    type: TopologyEntityType,
    displayIndex: number,
    stableId?: string,
    signature?: GeometricSignature
): TopologyReference {
    const ref: TopologyReference = {
        type,
        baseObjectId,
        indexHint: displayIndex,
        createdAt: Date.now(),
    };

    if (stableId) {
        ref.stableId = stableId;
    }

    // Create geometric selector from signature if available
    if (signature) {
        ref.geometricSelector = {};

        if (signature.centroid) {
            ref.geometricSelector.centroidPosition = signature.centroid;
            ref.geometricSelector.positionTolerance = 0.001;
        }

        if (signature.normal) {
            ref.geometricSelector.normalDirection = signature.normal;
            ref.geometricSelector.normalTolerance = 0.01;
        }

        if (signature.area !== undefined) {
            const tolerance = signature.area * 0.05; // 5% tolerance
            ref.geometricSelector.areaRange = {
                min: signature.area - tolerance,
                max: signature.area + tolerance,
            };
        }

        if (signature.surfaceType) {
            ref.geometricSelector.surfaceType = signature.surfaceType;
        }
    }

    return ref;
}

/**
 * Create a reference using a semantic selector
 */
export function createSemanticReference(
    baseObjectId: string,
    type: TopologyEntityType,
    selector: SemanticSelector,
    label?: string
): TopologyReference {
    return {
        type,
        baseObjectId,
        semanticSelector: selector,
        label: label || `${selector.type} ${type}`,
        createdAt: Date.now(),
    };
}

/**
 * Create a reference for the "top" face of an object
 */
export function createTopFaceReference(baseObjectId: string): TopologyReference {
    return createSemanticReference(baseObjectId, 'face', { type: 'topmost' }, 'Top Face');
}

/**
 * Create a reference for the "bottom" face of an object
 */
export function createBottomFaceReference(baseObjectId: string): TopologyReference {
    return createSemanticReference(baseObjectId, 'face', { type: 'bottommost' }, 'Bottom Face');
}

/**
 * Create a reference for the largest face of an object
 */
export function createLargestFaceReference(baseObjectId: string): TopologyReference {
    return createSemanticReference(baseObjectId, 'face', { type: 'largest' }, 'Largest Face');
}

/**
 * Create a reference for a face parallel to a plane
 */
export function createParallelFaceReference(
    baseObjectId: string,
    normal: [number, number, number]
): TopologyReference {
    return createSemanticReference(
        baseObjectId,
        'face',
        {
            type: 'parallel_to_plane',
            params: { direction: normal },
        },
        `Face parallel to [${normal.join(', ')}]`
    );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a reference has a stable ID
 */
export function hasStableId(ref: TopologyReference): boolean {
    return !!ref.stableId;
}

/**
 * Check if a reference has any selector
 */
export function hasSelector(ref: TopologyReference): boolean {
    return !!ref.semanticSelector || !!ref.geometricSelector;
}

/**
 * Check if a reference is index-only (legacy)
 */
export function isIndexOnlyReference(ref: TopologyReference): boolean {
    return !ref.stableId && !ref.semanticSelector && !ref.geometricSelector && ref.indexHint !== undefined;
}

/**
 * Get the resolution priority of a reference (lower = higher priority)
 */
export function getReferencePriority(ref: TopologyReference): number {
    if (ref.stableId) return 1;
    if (ref.semanticSelector) return 2;
    if (ref.geometricSelector) return 3;
    if (ref.indexHint !== undefined) return 4;
    return 5;
}

/**
 * Serialize a reference to JSON-safe format
 */
export function serializeReference(ref: TopologyReference): Record<string, any> {
    const result: Record<string, any> = {
        type: ref.type,
        baseObjectId: ref.baseObjectId,
    };

    if (ref.stableId) result.stableId = ref.stableId;
    if (ref.semanticSelector) result.semanticSelector = ref.semanticSelector;
    if (ref.geometricSelector) result.geometicSelector = ref.geometricSelector;
    if (ref.indexHint !== undefined) result.indexHint = ref.indexHint;
    if (ref.label) result.label = ref.label;
    if (ref.createdAt) result.createdAt = ref.createdAt;
    if (ref.sourceOperationId) result.sourceOperationId = ref.sourceOperationId;

    // Don't serialize _cached

    return result;
}

/**
 * Deserialize a reference from JSON
 */
export function deserializeReference(data: Record<string, any>): TopologyReference {
    return {
        type: data.type,
        baseObjectId: data.baseObjectId,
        stableId: data.stableId,
        semanticSelector: data.semanticSelector,
        geometricSelector: data.geometicSelector,
        indexHint: data.indexHint,
        label: data.label,
        createdAt: data.createdAt,
        sourceOperationId: data.sourceOperationId,
    };
}

/**
 * Generate a human-readable description of a reference
 */
export function describeReference(ref: TopologyReference): string {
    if (ref.label) return ref.label;

    const parts: string[] = [];

    if (ref.stableId) {
        parts.push(`${ref.type}[${ref.stableId.slice(0, 8)}]`);
    } else if (ref.semanticSelector) {
        parts.push(`${ref.semanticSelector.type} ${ref.type}`);
    } else if (ref.geometricSelector) {
        parts.push(`${ref.type} (by geometry)`);
    } else if (ref.indexHint !== undefined) {
        parts.push(`${ref.type} #${ref.indexHint}`);
    } else {
        parts.push(`${ref.type} (unresolved)`);
    }

    parts.push(`of ${ref.baseObjectId}`);

    return parts.join(' ');
}

/**
 * Clone a reference
 */
export function cloneReference(ref: TopologyReference): TopologyReference {
    return {
        ...ref,
        semanticSelector: ref.semanticSelector ? { ...ref.semanticSelector } : undefined,
        geometricSelector: ref.geometricSelector ? { ...ref.geometricSelector } : undefined,
        _cached: undefined, // Don't clone cache
    };
}

/**
 * Update a reference with a new stable ID (after resolution)
 */
export function updateReferenceStableId(ref: TopologyReference, stableId: string): TopologyReference {
    return {
        ...ref,
        stableId,
        _cached: undefined,
    };
}

// ============================================================================
// Legacy Compatibility
// ============================================================================

/**
 * Parse a legacy selection ID (e.g., "body1:face-0") into a TopologyReference
 */
export function parseSelectionId(selectionId: string): TopologyReference | null {
    const faceMatch = selectionId.match(/^(.+):face-(\d+)$/);
    if (faceMatch) {
        return {
            type: 'face',
            baseObjectId: faceMatch[1],
            indexHint: parseInt(faceMatch[2], 10),
        };
    }

    const edgeMatch = selectionId.match(/^(.+):edge-(\d+)$/);
    if (edgeMatch) {
        return {
            type: 'edge',
            baseObjectId: edgeMatch[1],
            indexHint: parseInt(edgeMatch[2], 10),
        };
    }

    const vertexMatch = selectionId.match(/^(.+):vertex-(\d+)$/);
    if (vertexMatch) {
        return {
            type: 'vertex',
            baseObjectId: vertexMatch[1],
            indexHint: parseInt(vertexMatch[2], 10),
        };
    }

    return null;
}

/**
 * Convert a TopologyReference back to a legacy selection ID string
 */
export function toSelectionId(ref: TopologyReference): string {
    const index = ref._cached?.resolvedIndex ?? ref.indexHint ?? 0;
    return `${ref.baseObjectId}:${ref.type}-${index}`;
}

/**
 * Check if a selection ID refers to a face
 */
export function isFaceSelection(selectionId: string): boolean {
    return selectionId.includes(':face-');
}

/**
 * Check if a selection ID refers to an edge
 */
export function isEdgeSelection(selectionId: string): boolean {
    return selectionId.includes(':edge-');
}

/**
 * Check if a selection ID refers to a vertex
 */
export function isVertexSelection(selectionId: string): boolean {
    return selectionId.includes(':vertex-');
}

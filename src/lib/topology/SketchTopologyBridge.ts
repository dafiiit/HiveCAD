/**
 * Sketch Topology Bridge
 * 
 * This module bridges the sketch system with the topological naming engine.
 * It assigns stable IDs to sketch primitives and tracks how they generate
 * topology through operations like extrude and revolve.
 * 
 * Phase 2: Sketch Entity Tagging
 */

import { v4 as uuidv4 } from 'uuid';
import type { SketchPrimitive } from '../../store/types';
import {
    StableTopologyId,
    GeneratorLink,
    createStableId,
    getTopologyTracker,
} from './index';

// ============================================================================
// Types
// ============================================================================

/**
 * Extended sketch primitive with stable ID
 */
export interface TaggedSketchPrimitive extends SketchPrimitive {
    /** Stable UUID that persists across edits */
    stableId: string;

    /** When this primitive was created */
    createdAt?: number;

    /** Unique points in this primitive (for vertex tracking) */
    pointStableIds?: string[];
}

/**
 * Sketch topology registry - tracks all primitives in a sketch
 */
export interface SketchTopologyRegistry {
    /** Sketch ID */
    sketchId: string;

    /** Stable ID for the sketch itself */
    sketchStableId: string;

    /** Map of primitive ID to stable ID */
    primitiveStableIds: Map<string, string>;

    /** Map of point hash to point stable ID */
    pointStableIds: Map<string, string>;

    /** When the registry was created */
    createdAt: number;

    /** Last modification time */
    modifiedAt: number;
}

// ============================================================================
// Sketch Primitive Tagging
// ============================================================================

/**
 * Tag a sketch primitive with a stable ID if it doesn't have one
 */
export function tagPrimitive(primitive: SketchPrimitive): TaggedSketchPrimitive {
    const tagged = primitive as TaggedSketchPrimitive;

    if (!tagged.stableId) {
        tagged.stableId = uuidv4();
        tagged.createdAt = Date.now();
    }

    // Tag each unique point
    if (!tagged.pointStableIds && primitive.points) {
        tagged.pointStableIds = primitive.points.map(() => uuidv4());
    }

    return tagged;
}

/**
 * Tag all primitives in an array
 */
export function tagAllPrimitives(primitives: SketchPrimitive[]): TaggedSketchPrimitive[] {
    return primitives.map(tagPrimitive);
}

/**
 * Create a point hash for deduplication
 */
export function hashPoint(point: [number, number], tolerance: number = 1e-6): string {
    const roundedX = Math.round(point[0] / tolerance) * tolerance;
    const roundedY = Math.round(point[1] / tolerance) * tolerance;
    return `${roundedX.toFixed(6)},${roundedY.toFixed(6)}`;
}

/**
 * Get or create a stable ID for a point
 */
export function getPointStableId(
    registry: SketchTopologyRegistry,
    point: [number, number]
): string {
    const hash = hashPoint(point);
    let stableId = registry.pointStableIds.get(hash);

    if (!stableId) {
        stableId = uuidv4();
        registry.pointStableIds.set(hash, stableId);
        registry.modifiedAt = Date.now();
    }

    return stableId;
}

// ============================================================================
// Sketch Registry Management
// ============================================================================

/**
 * Global registries for all sketches
 */
const sketchRegistries = new Map<string, SketchTopologyRegistry>();

/**
 * Create a new sketch topology registry
 */
export function createSketchRegistry(sketchId: string): SketchTopologyRegistry {
    const existing = sketchRegistries.get(sketchId);
    if (existing) return existing;

    const registry: SketchTopologyRegistry = {
        sketchId,
        sketchStableId: uuidv4(),
        primitiveStableIds: new Map(),
        pointStableIds: new Map(),
        createdAt: Date.now(),
        modifiedAt: Date.now(),
    };

    sketchRegistries.set(sketchId, registry);
    return registry;
}

/**
 * Get an existing sketch registry
 */
export function getSketchRegistry(sketchId: string): SketchTopologyRegistry | undefined {
    return sketchRegistries.get(sketchId);
}

/**
 * Register a primitive in the sketch registry
 */
export function registerPrimitive(
    registry: SketchTopologyRegistry,
    primitive: SketchPrimitive
): string {
    let stableId = registry.primitiveStableIds.get(primitive.id);

    if (!stableId) {
        stableId = (primitive as TaggedSketchPrimitive).stableId || uuidv4();
        registry.primitiveStableIds.set(primitive.id, stableId);
        registry.modifiedAt = Date.now();
    }

    // Also register all points
    if (primitive.points) {
        primitive.points.forEach(point => {
            getPointStableId(registry, point);
        });
    }

    return stableId;
}

/**
 * Clear a sketch registry
 */
export function clearSketchRegistry(sketchId: string): void {
    sketchRegistries.delete(sketchId);
}

/**
 * Clear all sketch registries
 */
export function clearAllSketchRegistries(): void {
    sketchRegistries.clear();
}

// ============================================================================
// Generator Link Creation
// ============================================================================

/**
 * Create generator links for an extruded face from a sketch edge
 */
export function createExtrusionGeneratorLinks(
    sketchEdgeStableId: string,
    sketchId: string,
    isEndCap: boolean,
    isTop: boolean
): GeneratorLink[] {
    const link: GeneratorLink = {
        type: 'extruded_from',
        sourceEntityId: sketchEdgeStableId,
        operationId: undefined, // Will be set during operation
    };

    if (isEndCap) {
        link.semanticTag = isTop ? 'top' : 'bottom';
    } else {
        link.semanticTag = 'side';
    }

    return [link];
}

/**
 * Create generator links for a revolved face from a sketch edge
 */
export function createRevolutionGeneratorLinks(
    sketchEdgeStableId: string,
    sketchId: string,
    isEndCap: boolean
): GeneratorLink[] {
    return [{
        type: 'revolved_from',
        sourceEntityId: sketchEdgeStableId,
        semanticTag: isEndCap ? 'end_cap' : 'lateral',
    }];
}

/**
 * Create generator links for a fillet face from an edge
 */
export function createFilletGeneratorLinks(
    sourceEdgeStableId: string,
    operationId?: string
): GeneratorLink[] {
    return [{
        type: 'fillet_of',
        sourceEntityId: sourceEdgeStableId,
        operationId,
    }];
}

/**
 * Create generator links for a boolean operation result
 */
export function createBooleanGeneratorLinks(
    operationType: 'fused_with' | 'cut_by' | 'intersected_with',
    sourceEntityId: string,
    operationId?: string
): GeneratorLink[] {
    return [{
        type: operationType,
        sourceEntityId,
        operationId,
    }];
}

// ============================================================================
// Sketch to Topology Mapping
// ============================================================================

/**
 * Maps sketch primitives to the faces they generate during extrusion
 */
export interface SketchToFaceMapping {
    /** The sketch this mapping is for */
    sketchId: string;

    /** The operation (e.g., extrude, revolve) that created this mapping */
    operationId: string;

    /** The feature ID in the code */
    featureId: string;

    /** Edge-to-side-face mappings (edge stable ID -> face stable IDs) */
    edgeToFaces: Map<string, string[]>;

    /** Top cap face stable ID */
    topCapFaceId?: string;

    /** Bottom cap face stable ID */
    bottomCapFaceId?: string;

    /** Profile edge mappings (sketch edge -> solid edge on caps) */
    profileEdges: Map<string, string[]>;
}

/**
 * Create an extrusion mapping from sketch to solid faces
 * 
 * When a sketch is extruded:
 * - Each sketch edge becomes a side face
 * - The sketch profile becomes the top and bottom caps
 * - Profile edges appear on both caps
 */
export function createExtrusionMapping(
    sketchId: string,
    registry: SketchTopologyRegistry,
    featureId: string,
    operationId: string,
    sketchEdgeCount: number
): SketchToFaceMapping {
    const mapping: SketchToFaceMapping = {
        sketchId,
        operationId,
        featureId,
        edgeToFaces: new Map(),
        profileEdges: new Map(),
    };

    // The top and bottom caps are derived from the entire profile
    mapping.topCapFaceId = uuidv4();
    mapping.bottomCapFaceId = uuidv4();

    // Each edge of the sketch generates a side face
    // (This will be refined when we actually analyze the extrusion result)
    for (const [primitiveId, stableId] of registry.primitiveStableIds) {
        mapping.edgeToFaces.set(stableId, [uuidv4()]);
    }

    return mapping;
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize a sketch registry for storage
 */
export function serializeSketchRegistry(registry: SketchTopologyRegistry): Record<string, any> {
    return {
        sketchId: registry.sketchId,
        sketchStableId: registry.sketchStableId,
        primitiveStableIds: Array.from(registry.primitiveStableIds.entries()),
        pointStableIds: Array.from(registry.pointStableIds.entries()),
        createdAt: registry.createdAt,
        modifiedAt: registry.modifiedAt,
    };
}

/**
 * Deserialize a sketch registry from storage
 */
export function deserializeSketchRegistry(data: Record<string, any>): SketchTopologyRegistry {
    const registry: SketchTopologyRegistry = {
        sketchId: data.sketchId,
        sketchStableId: data.sketchStableId,
        primitiveStableIds: new Map(data.primitiveStableIds || []),
        pointStableIds: new Map(data.pointStableIds || []),
        createdAt: data.createdAt || Date.now(),
        modifiedAt: data.modifiedAt || Date.now(),
    };

    sketchRegistries.set(registry.sketchId, registry);
    return registry;
}

/**
 * Serialize all registries
 */
export function serializeAllRegistries(): Record<string, any>[] {
    const result: Record<string, any>[] = [];
    for (const registry of sketchRegistries.values()) {
        result.push(serializeSketchRegistry(registry));
    }
    return result;
}

/**
 * Deserialize all registries
 */
export function deserializeAllRegistries(data: Record<string, any>[]): void {
    clearAllSketchRegistries();
    for (const item of data) {
        deserializeSketchRegistry(item);
    }
}

// ============================================================================
// Integration with TopologyTracker
// ============================================================================

/**
 * Register sketch topology with the global tracker
 */
export function registerSketchWithTracker(
    sketchId: string,
    primitives: SketchPrimitive[],
    operationId: string
): void {
    const tracker = getTopologyTracker();
    const registry = createSketchRegistry(sketchId);

    // Tag and register all primitives
    const taggedPrimitives = tagAllPrimitives(primitives);

    for (const primitive of taggedPrimitives) {
        const stableId = registerPrimitive(registry, primitive);

        // Register as edge in the tracker
        tracker.registerEdge(
            sketchId,
            Array.from(registry.primitiveStableIds.keys()).indexOf(primitive.id),
            [{
                type: 'primitive_face', // Using as a source edge
                sourceEntityId: stableId,
                operationId,
            }],
            {
                // Simplified signature for sketch edges
                centroid: primitive.points.length >= 2 ? [
                    (primitive.points[0][0] + primitive.points[primitive.points.length - 1][0]) / 2,
                    (primitive.points[0][1] + primitive.points[primitive.points.length - 1][1]) / 2,
                    0,
                ] : undefined,
                curveType: primitive.type === 'line' ? 'line' :
                    primitive.type === 'arc' || primitive.type === 'threePointsArc' ? 'circle' :
                        'bspline',
            },
            `sketch_${primitive.type}_${primitive.id.slice(0, 8)}`
        );
    }
}

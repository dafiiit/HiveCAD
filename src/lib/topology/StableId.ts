/**
 * Stable Topology Identification System
 * 
 * This module provides persistent identifiers for topological entities (faces, edges, vertices)
 * that survive model regeneration. This solves the "Topological Naming Problem" in CAD.
 * 
 * Key concepts:
 * - StableTopologyId: A persistent UUID-based identifier for any topology entity
 * - GeneratorLink: Records how an entity was created (e.g., "extruded from sketch edge X")
 * - GeometricSignature: Geometric properties used for fuzzy matching when IDs fail
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Core Types
// ============================================================================

/**
 * Type of topological entity
 */
export type TopologyEntityType = 'face' | 'edge' | 'vertex';

/**
 * Relationship type between a generated entity and its source
 */
export type GeneratorLinkType =
    | 'extruded_from'     // Face created by extruding a sketch edge
    | 'revolved_from'     // Face created by revolving a sketch edge
    | 'split_from'        // Entity created by splitting another
    | 'fused_with'        // Entity modified/created by fusion
    | 'cut_by'            // Entity modified/created by cut operation
    | 'intersected_with'  // Entity modified/created by intersection
    | 'fillet_of'         // Face/edge created by filleting
    | 'chamfer_of'        // Face/edge created by chamfering
    | 'offset_of'         // Entity created by offset operation
    | 'pattern_instance'  // Copy from a pattern operation
    | 'imported'          // Imported from external file (STEP, STL)
    | 'primitive_face';   // Original face of a primitive (box, cylinder, etc.)

/**
 * Semantic tag for common topological positions
 */
export type SemanticTag =
    | 'top'           // Top face (highest Z typically)
    | 'bottom'        // Bottom face (lowest Z typically)
    | 'side'          // Side/lateral face
    | 'front'         // Front face (+Y typically)
    | 'back'          // Back face (-Y typically)
    | 'left'          // Left face (-X typically)
    | 'right'         // Right face (+X typically)
    | 'end_cap'       // End cap of extrusion/revolve
    | 'lateral'       // Lateral (side) face of revolution
    | 'seam'          // Seam edge of a revolved surface
    | 'profile'       // Profile edge (from sketch)
    | 'silhouette'    // Silhouette edge
    | 'corner';       // Corner vertex

/**
 * Surface type classification (from OpenCascade)
 */
export type SurfaceType =
    | 'plane'
    | 'cylinder'
    | 'cone'
    | 'sphere'
    | 'torus'
    | 'bezier'
    | 'bspline'
    | 'revolution'
    | 'extrusion'
    | 'offset'
    | 'other';

/**
 * Curve type classification (from OpenCascade)
 */
export type CurveType =
    | 'line'
    | 'circle'
    | 'ellipse'
    | 'hyperbola'
    | 'parabola'
    | 'bezier'
    | 'bspline'
    | 'offset'
    | 'other';

// ============================================================================
// Geometric Signature
// ============================================================================

/**
 * Geometric signature for fuzzy matching when exact IDs fail.
 * Contains geometric properties that can be used to identify an entity
 * across topology regeneration.
 */
export interface GeometricSignature {
    /** Centroid position (for faces and edges) */
    centroid?: [number, number, number];

    /** Normal vector (for faces) - normalized */
    normal?: [number, number, number];

    /** Axis direction (for cylindrical/conical faces or linear edges) */
    axisDirection?: [number, number, number];

    /** Surface area (for faces) in square units */
    area?: number;

    /** Length (for edges) in linear units */
    length?: number;

    /** Surface type (for faces) */
    surfaceType?: SurfaceType;

    /** Curve type (for edges) */
    curveType?: CurveType;

    /** Radius (for cylindrical/spherical faces or circular edges) */
    radius?: number;

    /** Bounding box */
    boundingBox?: {
        min: [number, number, number];
        max: [number, number, number];
    };

    /** Number of edges bounding this face (for faces) */
    edgeCount?: number;

    /** Number of faces adjacent to this edge (for edges) */
    adjacentFaceCount?: number;

    /** Hash of adjacent entity UUIDs (for relationship-based matching) */
    adjacencyHash?: string;
}

// ============================================================================
// Generator Link
// ============================================================================

/**
 * Link to a source entity that generated this topology.
 * For example, an extruded face is generated from a sketch edge.
 */
export interface GeneratorLink {
    /** Type of relationship */
    type: GeneratorLinkType;

    /** StableId (UUID) of the source entity */
    sourceEntityId: string;

    /** Name of the source entity for debugging */
    sourceEntityName?: string;

    /** Additional semantic info */
    semanticTag?: SemanticTag;

    /** Index in the source (e.g., which edge of a sketch) */
    sourceIndex?: number;

    /** Operation ID that created this link */
    operationId?: string;
}

// ============================================================================
// Stable Topology ID
// ============================================================================

/**
 * Stable identifier for a topological entity (face, edge, vertex).
 * This ID persists across model regenerations.
 */
export interface StableTopologyId {
    /** UUID - globally unique across all time */
    uuid: string;

    /** Human-readable label for debugging (e.g., "Extrude1_TopFace") */
    label?: string;

    /** Type of entity */
    entityType: TopologyEntityType;

    /** The operation that created this entity */
    sourceOperationId: string;

    /** Name of the source operation for debugging */
    sourceOperationName?: string;

    /** The feature (AST variable) this entity belongs to */
    featureId: string;

    /** Links to source geometry that generated this entity */
    generatorLinks: GeneratorLink[];

    /** Geometric signature for heuristic matching */
    geometricSignature?: GeometricSignature;

    /** Creation timestamp */
    createdAt: number;

    /** Last regeneration timestamp */
    lastRegenAt?: number;

    /** Generation count (how many times this has been regenerated) */
    generation: number;

    /** Is this entity currently alive (exists in the model)? */
    isAlive: boolean;

    /** If dead, why was it removed? */
    deathReason?: 'deleted' | 'merged' | 'split' | 'replaced';

    /** If split, what entities did this split into? */
    splitInto?: string[];

    /** If merged, what entity did this merge into? */
    mergedInto?: string;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Generate a new UUID for a topology entity
 */
export function generateTopologyUUID(): string {
    return uuidv4();
}

/**
 * Create a new StableTopologyId
 */
export function createStableId(params: {
    entityType: TopologyEntityType;
    sourceOperationId: string;
    sourceOperationName?: string;
    featureId: string;
    generatorLinks?: GeneratorLink[];
    label?: string;
    geometricSignature?: GeometricSignature;
}): StableTopologyId {
    return {
        uuid: generateTopologyUUID(),
        entityType: params.entityType,
        sourceOperationId: params.sourceOperationId,
        sourceOperationName: params.sourceOperationName,
        featureId: params.featureId,
        generatorLinks: params.generatorLinks || [],
        label: params.label,
        geometricSignature: params.geometricSignature,
        createdAt: Date.now(),
        generation: 1,
        isAlive: true,
    };
}

/**
 * Create a StableId for a primitive face (box, cylinder, sphere, etc.)
 */
export function createPrimitiveFaceId(params: {
    primitiveType: string;
    featureId: string;
    operationId: string;
    faceIndex: number;
    semanticTag?: SemanticTag;
    signature?: GeometricSignature;
}): StableTopologyId {
    const label = `${params.primitiveType}_${params.semanticTag || `face${params.faceIndex}`}`;

    return createStableId({
        entityType: 'face',
        sourceOperationId: params.operationId,
        sourceOperationName: params.primitiveType,
        featureId: params.featureId,
        label,
        geometricSignature: params.signature,
        generatorLinks: [{
            type: 'primitive_face',
            sourceEntityId: params.featureId,
            semanticTag: params.semanticTag,
            sourceIndex: params.faceIndex,
            operationId: params.operationId,
        }],
    });
}

/**
 * Create a StableId for an extruded face (from a sketch edge)
 */
export function createExtrudedFaceId(params: {
    featureId: string;
    operationId: string;
    sourceSketchEdgeId: string;
    sourceEdgeName?: string;
    isEndCap: boolean;
    isTop: boolean;
    signature?: GeometricSignature;
}): StableTopologyId {
    let semanticTag: SemanticTag;
    let label: string;

    if (params.isEndCap) {
        semanticTag = params.isTop ? 'top' : 'bottom';
        label = `extrude_${semanticTag}_cap`;
    } else {
        semanticTag = 'side';
        label = `extrude_side_from_${params.sourceEdgeName || 'edge'}`;
    }

    return createStableId({
        entityType: 'face',
        sourceOperationId: params.operationId,
        sourceOperationName: 'extrude',
        featureId: params.featureId,
        label,
        geometricSignature: params.signature,
        generatorLinks: [{
            type: 'extruded_from',
            sourceEntityId: params.sourceSketchEdgeId,
            sourceEntityName: params.sourceEdgeName,
            semanticTag,
            operationId: params.operationId,
        }],
    });
}

/**
 * Create a StableId for a fillet face
 */
export function createFilletFaceId(params: {
    featureId: string;
    operationId: string;
    sourceEdgeId: string;
    sourceEdgeName?: string;
    index: number;
    signature?: GeometricSignature;
}): StableTopologyId {
    return createStableId({
        entityType: 'face',
        sourceOperationId: params.operationId,
        sourceOperationName: 'fillet',
        featureId: params.featureId,
        label: `fillet_face_${params.index}`,
        geometricSignature: params.signature,
        generatorLinks: [{
            type: 'fillet_of',
            sourceEntityId: params.sourceEdgeId,
            sourceEntityName: params.sourceEdgeName,
            sourceIndex: params.index,
            operationId: params.operationId,
        }],
    });
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize a StableTopologyId to JSON-safe format
 */
export function serializeStableId(id: StableTopologyId): Record<string, any> {
    return {
        ...id,
        // Ensure dates are numbers
        createdAt: id.createdAt,
        lastRegenAt: id.lastRegenAt,
    };
}

/**
 * Deserialize a StableTopologyId from JSON
 */
export function deserializeStableId(data: Record<string, any>): StableTopologyId {
    return {
        uuid: data.uuid,
        label: data.label,
        entityType: data.entityType,
        sourceOperationId: data.sourceOperationId,
        sourceOperationName: data.sourceOperationName,
        featureId: data.featureId,
        generatorLinks: data.generatorLinks || [],
        geometricSignature: data.geometricSignature,
        createdAt: data.createdAt || Date.now(),
        lastRegenAt: data.lastRegenAt,
        generation: data.generation || 1,
        isAlive: data.isAlive !== false,
        deathReason: data.deathReason,
        splitInto: data.splitInto,
        mergedInto: data.mergedInto,
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if two geometric signatures are similar enough to be considered a match
 */
export function signaturesMatch(
    sig1: GeometricSignature | undefined,
    sig2: GeometricSignature | undefined,
    tolerance: number = 1e-6
): { matches: boolean; confidence: number } {
    if (!sig1 || !sig2) {
        return { matches: false, confidence: 0 };
    }

    let totalScore = 0;
    let maxScore = 0;

    // Compare centroids (weight: 3)
    if (sig1.centroid && sig2.centroid) {
        const dist = vectorDistance(sig1.centroid, sig2.centroid);
        if (dist < tolerance) {
            totalScore += 3;
        } else if (dist < tolerance * 10) {
            totalScore += 2;
        } else if (dist < tolerance * 100) {
            totalScore += 1;
        }
        maxScore += 3;
    }

    // Compare normals (weight: 2)
    if (sig1.normal && sig2.normal) {
        const dot = vectorDot(sig1.normal, sig2.normal);
        if (Math.abs(dot - 1) < tolerance) {
            totalScore += 2;
        } else if (Math.abs(dot - 1) < tolerance * 10) {
            totalScore += 1;
        }
        maxScore += 2;
    }

    // Compare area (weight: 2)
    if (sig1.area !== undefined && sig2.area !== undefined) {
        const diff = Math.abs(sig1.area - sig2.area) / Math.max(sig1.area, sig2.area, 1e-10);
        if (diff < 0.01) {
            totalScore += 2;
        } else if (diff < 0.05) {
            totalScore += 1;
        }
        maxScore += 2;
    }

    // Compare surface type (weight: 1)
    if (sig1.surfaceType && sig2.surfaceType) {
        if (sig1.surfaceType === sig2.surfaceType) {
            totalScore += 1;
        }
        maxScore += 1;
    }

    // Compare edge count (weight: 1)
    if (sig1.edgeCount !== undefined && sig2.edgeCount !== undefined) {
        if (sig1.edgeCount === sig2.edgeCount) {
            totalScore += 1;
        }
        maxScore += 1;
    }

    const confidence = maxScore > 0 ? totalScore / maxScore : 0;
    return {
        matches: confidence > 0.7,
        confidence,
    };
}

/**
 * Euclidean distance between two 3D vectors
 */
function vectorDistance(a: [number, number, number], b: [number, number, number]): number {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Dot product of two 3D vectors
 */
function vectorDot(a: [number, number, number], b: [number, number, number]): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Generate a human-readable description of a StableId
 */
export function describeStableId(id: StableTopologyId): string {
    if (id.label) {
        return id.label;
    }

    const parts: string[] = [id.entityType];

    if (id.generatorLinks.length > 0) {
        const link = id.generatorLinks[0];
        parts.push(`(${link.type}`);
        if (link.semanticTag) {
            parts.push(`, ${link.semanticTag}`);
        }
        parts.push(')');
    }

    parts.push(`[${id.uuid.slice(0, 8)}]`);

    return parts.join('');
}

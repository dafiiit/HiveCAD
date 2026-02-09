/**
 * Worker Topology Bridge
 * 
 * Provides topology tracking integration between the replicad-worker and
 * the main thread. This module handles serialization of topology data
 * that needs to be passed from the worker back to the main thread.
 * 
 * Phase 4: Worker Integration
 */

import {
    StableTopologyId,
    GeometricSignature,
    GeneratorLink,
    TopologyEntityType,
    createStableId,
    serializeStableId,
    deserializeStableId,
} from './index';

// ============================================================================
// Types for Worker Communication
// ============================================================================

/**
 * Serialized topology data that can be passed via postMessage
 */
export interface SerializedTopologyData {
    /** Feature ID (AST variable name) */
    featureId: string;

    /** Serialized face topology */
    faces: Array<{
        index: number;
        stableId: Record<string, any>;
        signature: GeometricSignature;
    }>;

    /** Serialized edge topology */
    edges: Array<{
        index: number;
        stableId: Record<string, any>;
        signature: GeometricSignature;
    }>;

    /** Serialized vertex topology */
    vertices: Array<{
        index: number;
        stableId: Record<string, any>;
        position: [number, number, number];
    }>;

    /** Operation that created this topology */
    operationType?: string;

    /** Timestamp */
    timestamp: number;
}

/**
 * Topology-enhanced mesh result from worker
 */
export interface TopologyEnhancedMeshResult {
    id: string;
    meshData: {
        vertices: Float32Array;
        indices: Uint32Array;
        normals: Float32Array;
    } | null;
    edgeData: Float32Array | null;
    vertexData: Float32Array | null;
    faceMapping: Array<{ start: number; count: number; faceId: number }>;
    edgeMapping: Array<{ start: number; count: number; edgeId: number }>;

    /** NEW: Topology data */
    topology?: SerializedTopologyData;
}

// ============================================================================
// Topology Extraction (Worker-side)
// ============================================================================

/**
 * Extract geometric signature from a Replicad face
 */
export function extractFaceSignature(face: any, index: number): GeometricSignature {
    const signature: GeometricSignature = {};

    try {
        // Get center/centroid
        if (face.center) {
            const c = face.center;
            signature.centroid = [c.x || 0, c.y || 0, c.z || 0];
        }

        // Get normal at center
        if (face.normalAt) {
            try {
                const n = face.normalAt(face.center);
                if (n) {
                    signature.normal = [n.x || 0, n.y || 0, n.z || 0];
                }
            } catch {
                // Some faces may not have valid normals
            }
        }

        // Get area
        if (face.area !== undefined) {
            signature.area = face.area;
        } else if (typeof face.getArea === 'function') {
            try {
                signature.area = face.getArea();
            } catch {
                // Ignore
            }
        }

        // Get surface type
        if (face.geomType) {
            signature.surfaceType = mapSurfaceType(face.geomType);
        }

        // Get bounding box
        if (face.boundingBox) {
            const bb = face.boundingBox;
            signature.boundingBox = {
                min: [bb.min?.x || 0, bb.min?.y || 0, bb.min?.z || 0],
                max: [bb.max?.x || 0, bb.max?.y || 0, bb.max?.z || 0],
            };
        }

        // Count edges
        if (face.edges) {
            const edges = Array.from(face.edges);
            signature.edgeCount = edges.length;
        }

    } catch (err) {
        console.warn(`Failed to extract signature for face ${index}:`, err);
    }

    return signature;
}

/**
 * Extract geometric signature from a Replicad edge
 */
export function extractEdgeSignature(edge: any, index: number): GeometricSignature {
    const signature: GeometricSignature = {};

    try {
        // Get center/centroid
        if (edge.center) {
            const c = edge.center;
            signature.centroid = [c.x || 0, c.y || 0, c.z || 0];
        }

        // Get length
        if (edge.length !== undefined) {
            signature.length = edge.length;
        } else if (typeof edge.getLength === 'function') {
            try {
                signature.length = edge.getLength();
            } catch {
                // Ignore
            }
        }

        // Get curve type
        if (edge.geomType) {
            signature.curveType = mapCurveType(edge.geomType);
        }

        // Get direction for linear edges
        if (edge.startPoint && edge.endPoint) {
            const start = edge.startPoint;
            const end = edge.endPoint;
            const dx = (end.x || 0) - (start.x || 0);
            const dy = (end.y || 0) - (start.y || 0);
            const dz = (end.z || 0) - (start.z || 0);
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len > 1e-10) {
                signature.axisDirection = [dx / len, dy / len, dz / len];
            }
        }

    } catch (err) {
        console.warn(`Failed to extract signature for edge ${index}:`, err);
    }

    return signature;
}

/**
 * Map OpenCascade surface type to our SurfaceType
 */
function mapSurfaceType(geomType: string): GeometricSignature['surfaceType'] {
    const type = geomType?.toLowerCase() || '';
    if (type.includes('plane')) return 'plane';
    if (type.includes('cylinder')) return 'cylinder';
    if (type.includes('cone')) return 'cone';
    if (type.includes('sphere')) return 'sphere';
    if (type.includes('torus')) return 'torus';
    if (type.includes('bezier')) return 'bezier';
    if (type.includes('bspline')) return 'bspline';
    if (type.includes('revolution')) return 'revolution';
    if (type.includes('extrusion')) return 'extrusion';
    if (type.includes('offset')) return 'offset';
    return 'other';
}

/**
 * Map OpenCascade curve type to our CurveType
 */
function mapCurveType(geomType: string): GeometricSignature['curveType'] {
    const type = geomType?.toLowerCase() || '';
    if (type.includes('line')) return 'line';
    if (type.includes('circle')) return 'circle';
    if (type.includes('ellipse')) return 'ellipse';
    if (type.includes('hyperbola')) return 'hyperbola';
    if (type.includes('parabola')) return 'parabola';
    if (type.includes('bezier')) return 'bezier';
    if (type.includes('bspline')) return 'bspline';
    if (type.includes('offset')) return 'offset';
    return 'other';
}

/**
 * Generate topology data for a shape (to be called from worker)
 */
export function generateTopologyForShape(
    shape: any,
    featureId: string,
    operationType?: string
): SerializedTopologyData {
    const timestamp = Date.now();
    const faces: SerializedTopologyData['faces'] = [];
    const edges: SerializedTopologyData['edges'] = [];
    const vertices: SerializedTopologyData['vertices'] = [];

    // Process faces
    if (shape.faces) {
        const faceArr = Array.from(shape.faces);
        for (let i = 0; i < faceArr.length; i++) {
            const face: any = faceArr[i];
            const signature = extractFaceSignature(face, i);

            const stableId = createStableId({
                entityType: 'face',
                sourceOperationId: `${featureId}_op`,
                sourceOperationName: operationType,
                featureId,
                label: `${featureId}_face_${i}`,
                geometricSignature: signature,
            });

            faces.push({
                index: i,
                stableId: serializeStableId(stableId),
                signature,
            });
        }
    }

    // Process edges
    if (shape.edges) {
        const edgeArr = Array.from(shape.edges);
        for (let i = 0; i < edgeArr.length; i++) {
            const edge: any = edgeArr[i];
            const signature = extractEdgeSignature(edge, i);

            const stableId = createStableId({
                entityType: 'edge',
                sourceOperationId: `${featureId}_op`,
                sourceOperationName: operationType,
                featureId,
                label: `${featureId}_edge_${i}`,
                geometricSignature: signature,
            });

            edges.push({
                index: i,
                stableId: serializeStableId(stableId),
                signature,
            });
        }
    }

    // Process vertices
    if (shape.vertices) {
        const vertArr = Array.from(shape.vertices);
        for (let i = 0; i < vertArr.length; i++) {
            const vertex: any = vertArr[i];
            const p = vertex.point || vertex.center || { x: 0, y: 0, z: 0 };
            const position: [number, number, number] = [p.x || 0, p.y || 0, p.z || 0];

            const stableId = createStableId({
                entityType: 'vertex',
                sourceOperationId: `${featureId}_op`,
                sourceOperationName: operationType,
                featureId,
                label: `${featureId}_vertex_${i}`,
                geometricSignature: { centroid: position },
            });

            vertices.push({
                index: i,
                stableId: serializeStableId(stableId),
                position,
            });
        }
    }

    return {
        featureId,
        faces,
        edges,
        vertices,
        operationType,
        timestamp,
    };
}

// ============================================================================
// Topology Reconstruction (Main Thread Side)
// ============================================================================

/**
 * Reconstruct StableTopologyId from serialized data
 */
export function reconstructTopologyId(serialized: Record<string, any>): StableTopologyId {
    return deserializeStableId(serialized);
}

/**
 * Reconstruct full topology data from serialized worker response
 */
export function reconstructTopologyData(serialized: SerializedTopologyData): {
    featureId: string;
    faces: Array<{ index: number; stableId: StableTopologyId; signature: GeometricSignature }>;
    edges: Array<{ index: number; stableId: StableTopologyId; signature: GeometricSignature }>;
    vertices: Array<{ index: number; stableId: StableTopologyId; position: [number, number, number] }>;
} {
    return {
        featureId: serialized.featureId,
        faces: serialized.faces.map(f => ({
            index: f.index,
            stableId: reconstructTopologyId(f.stableId),
            signature: f.signature,
        })),
        edges: serialized.edges.map(e => ({
            index: e.index,
            stableId: reconstructTopologyId(e.stableId),
            signature: e.signature,
        })),
        vertices: serialized.vertices.map(v => ({
            index: v.index,
            stableId: reconstructTopologyId(v.stableId),
            position: v.position,
        })),
    };
}

// ============================================================================
// Topology Storage Types
// ============================================================================

/**
 * Topology state stored in CADObject
 */
export interface ObjectTopologyState {
    /** Map of stable ID UUID to face index */
    faceIdToIndex: Map<string, number>;

    /** Map of face index to stable ID UUID */
    indexToFaceId: Map<number, string>;

    /** Map of stable ID UUID to edge index */
    edgeIdToIndex: Map<string, number>;

    /** Map of edge index to stable ID UUID */
    indexToEdgeId: Map<number, string>;

    /** Map of stable ID UUID to vertex index */
    vertexIdToIndex: Map<string, number>;

    /** Map of vertex index to stable ID UUID */
    indexToVertexId: Map<number, string>;

    /** Full stable IDs for each entity */
    stableIds: Map<string, StableTopologyId>;

    /** Geometric signatures for each entity */
    signatures: Map<string, GeometricSignature>;

    /** Last update timestamp */
    lastUpdated: number;
}

/**
 * Create an empty topology state
 */
export function createEmptyTopologyState(): ObjectTopologyState {
    return {
        faceIdToIndex: new Map(),
        indexToFaceId: new Map(),
        edgeIdToIndex: new Map(),
        indexToEdgeId: new Map(),
        vertexIdToIndex: new Map(),
        indexToVertexId: new Map(),
        stableIds: new Map(),
        signatures: new Map(),
        lastUpdated: 0,
    };
}

/**
 * Build topology state from serialized worker data
 */
export function buildTopologyState(data: SerializedTopologyData): ObjectTopologyState {
    const state = createEmptyTopologyState();
    state.lastUpdated = data.timestamp;

    // Process faces
    for (const face of data.faces) {
        const stableId = reconstructTopologyId(face.stableId);
        state.faceIdToIndex.set(stableId.uuid, face.index);
        state.indexToFaceId.set(face.index, stableId.uuid);
        state.stableIds.set(stableId.uuid, stableId);
        state.signatures.set(stableId.uuid, face.signature);
    }

    // Process edges
    for (const edge of data.edges) {
        const stableId = reconstructTopologyId(edge.stableId);
        state.edgeIdToIndex.set(stableId.uuid, edge.index);
        state.indexToEdgeId.set(edge.index, stableId.uuid);
        state.stableIds.set(stableId.uuid, stableId);
        state.signatures.set(stableId.uuid, edge.signature);
    }

    // Process vertices
    for (const vertex of data.vertices) {
        const stableId = reconstructTopologyId(vertex.stableId);
        state.vertexIdToIndex.set(stableId.uuid, vertex.index);
        state.indexToVertexId.set(vertex.index, stableId.uuid);
        state.stableIds.set(stableId.uuid, stableId);
        state.signatures.set(stableId.uuid, { centroid: vertex.position });
    }

    return state;
}

/**
 * Serialize topology state for storage
 */
export function serializeTopologyState(state: ObjectTopologyState): Record<string, any> {
    return {
        faceIdToIndex: Object.fromEntries(state.faceIdToIndex),
        indexToFaceId: Object.fromEntries(state.indexToFaceId),
        edgeIdToIndex: Object.fromEntries(state.edgeIdToIndex),
        indexToEdgeId: Object.fromEntries(state.indexToEdgeId),
        vertexIdToIndex: Object.fromEntries(state.vertexIdToIndex),
        indexToVertexId: Object.fromEntries(state.indexToVertexId),
        stableIds: Object.fromEntries(
            Array.from(state.stableIds.entries()).map(([k, v]) => [k, serializeStableId(v)])
        ),
        signatures: Object.fromEntries(state.signatures),
        lastUpdated: state.lastUpdated,
    };
}

/**
 * Deserialize topology state from storage
 */
export function deserializeTopologyState(data: Record<string, any>): ObjectTopologyState {
    return {
        faceIdToIndex: new Map(Object.entries(data.faceIdToIndex || {})),
        indexToFaceId: new Map(
            Object.entries(data.indexToFaceId || {}).map(([k, v]) => [parseInt(k), v as string])
        ),
        edgeIdToIndex: new Map(Object.entries(data.edgeIdToIndex || {})),
        indexToEdgeId: new Map(
            Object.entries(data.indexToEdgeId || {}).map(([k, v]) => [parseInt(k), v as string])
        ),
        vertexIdToIndex: new Map(Object.entries(data.vertexIdToIndex || {})),
        indexToVertexId: new Map(
            Object.entries(data.indexToVertexId || {}).map(([k, v]) => [parseInt(k), v as string])
        ),
        stableIds: new Map(
            Object.entries(data.stableIds || {}).map(([k, v]) => [k, deserializeStableId(v as Record<string, any>)])
        ),
        signatures: new Map(Object.entries(data.signatures || {})),
        lastUpdated: data.lastUpdated || 0,
    };
}

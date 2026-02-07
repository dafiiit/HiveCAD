/**
 * Shape Analyzer for OpenCascade/Replicad Shapes
 * 
 * This module provides utilities for analyzing CAD shapes and extracting
 * geometric signatures for topological naming. It wraps the OpenCascade
 * geometry introspection APIs.
 * 
 * The analyzer extracts:
 * - Face properties: centroid, normal, area, surface type, edge count
 * - Edge properties: centroid, length, curve type, direction
 * - Vertex properties: position
 * 
 * These signatures are used for fuzzy matching when stable IDs cannot be resolved.
 */

import {
    GeometricSignature,
    SurfaceType,
    CurveType,
    StableTopologyId,
    GeneratorLink,
    createStableId,
} from './StableId';
import { TopologyAnalysisResult } from './TopologyTracker';

// ============================================================================
// Types
// ============================================================================

/**
 * Replicad shape interface (subset of what we need)
 */
export interface ReplicadShape {
    faces?: Iterable<ReplicadFace>;
    edges?: Iterable<ReplicadEdge>;
    vertices?: Iterable<ReplicadVertex>;
    type?: string;
}

export interface ReplicadFace {
    center?: { x: number; y: number; z: number };
    normalAt?(point?: any): { x: number; y: number; z: number };
    area?: number;
    surfaceType?(): string;
    outerWire?(): any;
    edges?: Iterable<any>;
    clone?(): ReplicadFace;
}

export interface ReplicadEdge {
    startPoint?: { x: number; y: number; z: number };
    endPoint?: { x: number; y: number; z: number };
    length?: number;
    curveType?(): string;
    tangentAt?(point: any): { x: number; y: number; z: number };
    clone?(): ReplicadEdge;
}

export interface ReplicadVertex {
    point?: { x: number; y: number; z: number };
    center?: { x: number; y: number; z: number };
}

// ============================================================================
// Shape Analyzer Class
// ============================================================================

/**
 * Analyzes a CAD shape and extracts geometric properties for each topology entity.
 */
export class ShapeAnalyzer {
    private shape: ReplicadShape;
    private featureId: string;
    private operationId: string;
    private operationName?: string;

    // Cached analysis results
    private facesCache: Array<{
        index: number;
        signature: GeometricSignature;
    }> | null = null;

    private edgesCache: Array<{
        index: number;
        signature: GeometricSignature;
    }> | null = null;

    private verticesCache: Array<{
        index: number;
        position: [number, number, number];
    }> | null = null;

    constructor(
        shape: ReplicadShape,
        featureId: string,
        operationId: string,
        operationName?: string
    ) {
        this.shape = shape;
        this.featureId = featureId;
        this.operationId = operationId;
        this.operationName = operationName;
    }

    // ========================================================================
    // Face Analysis
    // ========================================================================

    /**
     * Get the number of faces
     */
    getFaceCount(): number {
        if (!this.shape.faces) return 0;
        const faces = Array.from(this.shape.faces);
        return faces.length;
    }

    /**
     * Analyze all faces and extract signatures
     */
    analyzeFaces(): Array<{ index: number; signature: GeometricSignature }> {
        if (this.facesCache) return this.facesCache;

        if (!this.shape.faces) {
            this.facesCache = [];
            return this.facesCache;
        }

        const faces = Array.from(this.shape.faces);
        this.facesCache = faces.map((face, index) => ({
            index,
            signature: this.extractFaceSignature(face),
        }));

        return this.facesCache;
    }

    /**
     * Get signature for a specific face
     */
    getFaceSignature(index: number): GeometricSignature {
        const faces = this.analyzeFaces();
        return faces[index]?.signature || {};
    }

    /**
     * Extract geometric signature from a face
     */
    private extractFaceSignature(face: ReplicadFace): GeometricSignature {
        const signature: GeometricSignature = {};

        // Centroid
        if (face.center) {
            signature.centroid = [face.center.x, face.center.y, face.center.z];
        }

        // Normal
        try {
            if (face.normalAt) {
                const normal = face.normalAt(face.center);
                if (normal) {
                    // Normalize the normal vector
                    const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
                    if (len > 1e-10) {
                        signature.normal = [normal.x / len, normal.y / len, normal.z / len];
                    }
                }
            }
        } catch (e) {
            // Normal extraction failed, continue without it
        }

        // Area
        if (typeof face.area === 'number') {
            signature.area = face.area;
        }

        // Surface type
        try {
            if (face.surfaceType) {
                const typeStr = face.surfaceType();
                signature.surfaceType = this.normalizesSurfaceType(typeStr);
            }
        } catch (e) {
            // Surface type extraction failed
        }

        // Edge count
        try {
            if (face.edges) {
                const edges = Array.from(face.edges);
                signature.edgeCount = edges.length;
            }
        } catch (e) {
            // Edge count extraction failed
        }

        return signature;
    }

    /**
     * Normalize surface type string to our enum
     */
    private normalizesSurfaceType(typeStr: string): SurfaceType {
        const lower = typeStr.toLowerCase();
        if (lower.includes('plane')) return 'plane';
        if (lower.includes('cylinder')) return 'cylinder';
        if (lower.includes('cone')) return 'cone';
        if (lower.includes('sphere')) return 'sphere';
        if (lower.includes('torus')) return 'torus';
        if (lower.includes('bezier')) return 'bezier';
        if (lower.includes('bspline') || lower.includes('nurbs')) return 'bspline';
        if (lower.includes('revolution')) return 'revolution';
        if (lower.includes('extrusion')) return 'extrusion';
        if (lower.includes('offset')) return 'offset';
        return 'other';
    }

    // ========================================================================
    // Edge Analysis
    // ========================================================================

    /**
     * Get the number of edges
     */
    getEdgeCount(): number {
        if (!this.shape.edges) return 0;
        const edges = Array.from(this.shape.edges);
        return edges.length;
    }

    /**
     * Analyze all edges and extract signatures
     */
    analyzeEdges(): Array<{ index: number; signature: GeometricSignature }> {
        if (this.edgesCache) return this.edgesCache;

        if (!this.shape.edges) {
            this.edgesCache = [];
            return this.edgesCache;
        }

        const edges = Array.from(this.shape.edges);
        this.edgesCache = edges.map((edge, index) => ({
            index,
            signature: this.extractEdgeSignature(edge),
        }));

        return this.edgesCache;
    }

    /**
     * Get signature for a specific edge
     */
    getEdgeSignature(index: number): GeometricSignature {
        const edges = this.analyzeEdges();
        return edges[index]?.signature || {};
    }

    /**
     * Extract geometric signature from an edge
     */
    private extractEdgeSignature(edge: ReplicadEdge): GeometricSignature {
        const signature: GeometricSignature = {};

        // Centroid (midpoint of start and end)
        if (edge.startPoint && edge.endPoint) {
            signature.centroid = [
                (edge.startPoint.x + edge.endPoint.x) / 2,
                (edge.startPoint.y + edge.endPoint.y) / 2,
                (edge.startPoint.z + edge.endPoint.z) / 2,
            ];

            // Direction (for linear edges)
            const dx = edge.endPoint.x - edge.startPoint.x;
            const dy = edge.endPoint.y - edge.startPoint.y;
            const dz = edge.endPoint.z - edge.startPoint.z;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len > 1e-10) {
                signature.axisDirection = [dx / len, dy / len, dz / len];
            }
        }

        // Length
        if (typeof edge.length === 'number') {
            signature.length = edge.length;
        }

        // Curve type
        try {
            if (edge.curveType) {
                const typeStr = edge.curveType();
                signature.curveType = this.normalizeCurveType(typeStr);
            }
        } catch (e) {
            // Curve type extraction failed
        }

        return signature;
    }

    /**
     * Normalize curve type string to our enum
     */
    private normalizeCurveType(typeStr: string): CurveType {
        const lower = typeStr.toLowerCase();
        if (lower.includes('line')) return 'line';
        if (lower.includes('circle')) return 'circle';
        if (lower.includes('ellipse')) return 'ellipse';
        if (lower.includes('hyperbola')) return 'hyperbola';
        if (lower.includes('parabola')) return 'parabola';
        if (lower.includes('bezier')) return 'bezier';
        if (lower.includes('bspline') || lower.includes('nurbs')) return 'bspline';
        if (lower.includes('offset')) return 'offset';
        return 'other';
    }

    // ========================================================================
    // Vertex Analysis
    // ========================================================================

    /**
     * Get the number of vertices
     */
    getVertexCount(): number {
        if (!this.shape.vertices) return 0;
        const vertices = Array.from(this.shape.vertices);
        return vertices.length;
    }

    /**
     * Analyze all vertices
     */
    analyzeVertices(): Array<{ index: number; position: [number, number, number] }> {
        if (this.verticesCache) return this.verticesCache;

        if (!this.shape.vertices) {
            this.verticesCache = [];
            return this.verticesCache;
        }

        const vertices = Array.from(this.shape.vertices);
        this.verticesCache = vertices.map((vertex, index) => ({
            index,
            position: this.extractVertexPosition(vertex),
        }));

        return this.verticesCache;
    }

    /**
     * Get position for a specific vertex
     */
    getVertexPosition(index: number): [number, number, number] {
        const vertices = this.analyzeVertices();
        return vertices[index]?.position || [0, 0, 0];
    }

    /**
     * Extract position from a vertex
     */
    private extractVertexPosition(vertex: ReplicadVertex): [number, number, number] {
        const point = vertex.point || vertex.center;
        if (point) {
            return [point.x, point.y, point.z];
        }
        return [0, 0, 0];
    }

    // ========================================================================
    // Full Analysis
    // ========================================================================

    /**
     * Perform full topology analysis and return results suitable for TopologyTracker
     */
    analyzeFullTopology(
        generatorLinksProvider?: (type: 'face' | 'edge' | 'vertex', index: number) => GeneratorLink[]
    ): TopologyAnalysisResult {
        const defaultGeneratorLinks = (type: string, index: number): GeneratorLink[] => [{
            type: 'primitive_face' as any,
            sourceEntityId: this.featureId,
            sourceIndex: index,
            operationId: this.operationId,
        }];

        const getLinks = generatorLinksProvider || defaultGeneratorLinks;

        // Analyze faces
        const faceAnalysis = this.analyzeFaces();
        const faces = faceAnalysis.map(f => ({
            index: f.index,
            signature: f.signature,
            stableId: createStableId({
                entityType: 'face' as const,
                sourceOperationId: this.operationId,
                sourceOperationName: this.operationName,
                featureId: this.featureId,
                generatorLinks: getLinks('face', f.index),
                geometricSignature: f.signature,
                label: this.generateFaceLabel(f.index, f.signature),
            }),
        }));

        // Analyze edges
        const edgeAnalysis = this.analyzeEdges();
        const edges = edgeAnalysis.map(e => ({
            index: e.index,
            signature: e.signature,
            stableId: createStableId({
                entityType: 'edge' as const,
                sourceOperationId: this.operationId,
                sourceOperationName: this.operationName,
                featureId: this.featureId,
                generatorLinks: getLinks('edge', e.index),
                geometricSignature: e.signature,
                label: this.generateEdgeLabel(e.index, e.signature),
            }),
        }));

        // Analyze vertices
        const vertexAnalysis = this.analyzeVertices();
        const vertices = vertexAnalysis.map(v => ({
            index: v.index,
            position: v.position,
            stableId: createStableId({
                entityType: 'vertex' as const,
                sourceOperationId: this.operationId,
                sourceOperationName: this.operationName,
                featureId: this.featureId,
                generatorLinks: getLinks('vertex', v.index),
                geometricSignature: { centroid: v.position },
                label: `vertex_${v.index}`,
            }),
        }));

        return { faces, edges, vertices };
    }

    /**
     * Generate a descriptive label for a face
     */
    private generateFaceLabel(index: number, signature: GeometricSignature): string {
        const parts: string[] = [];

        // Add semantic description based on normal
        if (signature.normal) {
            const [nx, ny, nz] = signature.normal;
            if (Math.abs(nz) > 0.99) {
                parts.push(nz > 0 ? 'top' : 'bottom');
            } else if (Math.abs(ny) > 0.99) {
                parts.push(ny > 0 ? 'front' : 'back');
            } else if (Math.abs(nx) > 0.99) {
                parts.push(nx > 0 ? 'right' : 'left');
            } else {
                parts.push('side');
            }
        }

        // Add surface type
        if (signature.surfaceType && signature.surfaceType !== 'other') {
            parts.push(signature.surfaceType);
        }

        // Add index for uniqueness
        parts.push(`face_${index}`);

        return parts.join('_');
    }

    /**
     * Generate a descriptive label for an edge
     */
    private generateEdgeLabel(index: number, signature: GeometricSignature): string {
        const parts: string[] = [];

        // Add curve type
        if (signature.curveType && signature.curveType !== 'other') {
            parts.push(signature.curveType);
        }

        // Add index for uniqueness
        parts.push(`edge_${index}`);

        return parts.join('_');
    }

    // ========================================================================
    // Semantic Analysis
    // ========================================================================

    /**
     * Find the topmost face (highest Z centroid)
     */
    findTopmostFace(): number {
        const faces = this.analyzeFaces();
        let topIndex = 0;
        let topZ = -Infinity;

        for (const face of faces) {
            if (face.signature.centroid && face.signature.centroid[2] > topZ) {
                topZ = face.signature.centroid[2];
                topIndex = face.index;
            }
        }

        return topIndex;
    }

    /**
     * Find the bottommost face (lowest Z centroid)
     */
    findBottommostFace(): number {
        const faces = this.analyzeFaces();
        let bottomIndex = 0;
        let bottomZ = Infinity;

        for (const face of faces) {
            if (face.signature.centroid && face.signature.centroid[2] < bottomZ) {
                bottomZ = face.signature.centroid[2];
                bottomIndex = face.index;
            }
        }

        return bottomIndex;
    }

    /**
     * Find the largest face by area
     */
    findLargestFace(): number {
        const faces = this.analyzeFaces();
        let largestIndex = 0;
        let largestArea = 0;

        for (const face of faces) {
            if (face.signature.area !== undefined && face.signature.area > largestArea) {
                largestArea = face.signature.area;
                largestIndex = face.index;
            }
        }

        return largestIndex;
    }

    /**
     * Find faces with normal parallel to a direction (within tolerance)
     */
    findFacesParallelTo(
        direction: [number, number, number],
        tolerance: number = 0.01
    ): number[] {
        const faces = this.analyzeFaces();
        const result: number[] = [];

        // Normalize direction
        const len = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
        const normalizedDir = [direction[0] / len, direction[1] / len, direction[2] / len];

        for (const face of faces) {
            if (face.signature.normal) {
                const dot = Math.abs(
                    face.signature.normal[0] * normalizedDir[0] +
                    face.signature.normal[1] * normalizedDir[1] +
                    face.signature.normal[2] * normalizedDir[2]
                );
                if (Math.abs(dot - 1) < tolerance) {
                    result.push(face.index);
                }
            }
        }

        return result;
    }

    /**
     * Find planar faces (surface type = plane)
     */
    findPlanarFaces(): number[] {
        const faces = this.analyzeFaces();
        return faces
            .filter(f => f.signature.surfaceType === 'plane')
            .map(f => f.index);
    }

    /**
     * Find cylindrical faces
     */
    findCylindricalFaces(): number[] {
        const faces = this.analyzeFaces();
        return faces
            .filter(f => f.signature.surfaceType === 'cylinder')
            .map(f => f.index);
    }
}

/**
 * Create a ShapeAnalyzer for a shape
 */
export function analyzeShape(
    shape: ReplicadShape,
    featureId: string,
    operationId: string,
    operationName?: string
): ShapeAnalyzer {
    return new ShapeAnalyzer(shape, featureId, operationId, operationName);
}

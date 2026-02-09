/**
 * Primitive Analyzer
 * 
 * Analyzes primitives (Box, Cylinder, Sphere, etc.) and creates
 * stable topology IDs with semantic labels for each face.
 * 
 * Phase 3: Operation Instrumentation
 */

import {
    StableTopologyId,
    GeneratorLink,
    GeometricSignature,
    createStableId,
    createPrimitiveFaceId,
    getTopologyTracker,
} from '../index';
import { ShapeAnalyzer, ReplicadShape } from '../ShapeAnalyzer';
import { TopologyAnalysisResult } from '../TopologyTracker';

// ============================================================================
// Types
// ============================================================================

export type PrimitiveType = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus';

/**
 * Primitive creation parameters
 */
export interface PrimitiveParams {
    type: PrimitiveType;

    // Box
    width?: number;
    height?: number;
    depth?: number;

    // Cylinder/Cone
    radius?: number;
    topRadius?: number;  // For cone

    // Sphere
    // radius is shared

    // Torus
    majorRadius?: number;
    minorRadius?: number;
}

/**
 * Semantic face types for primitives
 */
export type PrimitiveFaceSemantics =
    | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'  // Box
    | 'lateral' | 'top_cap' | 'bottom_cap'  // Cylinder/Cone
    | 'outer'  // Sphere/Torus
    | 'inner'  // Torus
    | 'unknown';

/**
 * Analysis result for a primitive
 */
export interface PrimitiveAnalysisResult {
    /** All faces with semantic labels */
    faces: Array<{
        stableId: StableTopologyId;
        faceIndex: number;
        semantic: PrimitiveFaceSemantics;
    }>;

    /** All edges */
    edges: Array<{
        stableId: StableTopologyId;
        edgeIndex: number;
    }>;

    /** All vertices */
    vertices: Array<{
        stableId: StableTopologyId;
        vertexIndex: number;
    }>;

    /** Semantic face lookup */
    semanticFaces: Map<PrimitiveFaceSemantics, number[]>;

    /** Full topology analysis for tracker */
    topologyAnalysis: TopologyAnalysisResult;
}

// ============================================================================
// Primitive Analyzer
// ============================================================================

/**
 * Analyzes a primitive and creates stable topology IDs with semantic labels
 */
export class PrimitiveAnalyzer {
    private shape: ReplicadShape;
    private featureId: string;
    private operationId: string;
    private params: PrimitiveParams;
    private shapeAnalyzer: ShapeAnalyzer;

    constructor(
        shape: ReplicadShape,
        featureId: string,
        operationId: string,
        params: PrimitiveParams
    ) {
        this.shape = shape;
        this.featureId = featureId;
        this.operationId = operationId;
        this.params = params;
        this.shapeAnalyzer = new ShapeAnalyzer(shape, featureId, operationId, `make${params.type}`);
    }

    /**
     * Analyze the primitive
     */
    analyze(): PrimitiveAnalysisResult {
        const faces = this.shapeAnalyzer.analyzeFaces();
        const edges = this.shapeAnalyzer.analyzeEdges();
        const vertices = this.shapeAnalyzer.analyzeVertices();

        // Classify faces based on primitive type
        const classifiedFaces = this.classifyFaces(faces);
        const semanticFaces = new Map<PrimitiveFaceSemantics, number[]>();

        for (const face of classifiedFaces) {
            const existing = semanticFaces.get(face.semantic) || [];
            existing.push(face.faceIndex);
            semanticFaces.set(face.semantic, existing);
        }

        return {
            faces: classifiedFaces,
            edges: edges.map((edge, idx) => ({
                stableId: createStableId({
                    entityType: 'edge',
                    sourceOperationId: this.operationId,
                    sourceOperationName: `make${this.params.type}`,
                    featureId: this.featureId,
                    generatorLinks: [{
                        type: 'primitive_face',
                        sourceEntityId: this.featureId,
                        sourceIndex: idx,
                    }],
                    label: `${this.params.type}_edge_${idx}`,
                    geometricSignature: edge.signature,
                }),
                edgeIndex: edge.index,
            })),
            vertices: vertices.map((vertex, idx) => ({
                stableId: createStableId({
                    entityType: 'vertex',
                    sourceOperationId: this.operationId,
                    sourceOperationName: `make${this.params.type}`,
                    featureId: this.featureId,
                    generatorLinks: [],
                    label: `${this.params.type}_vertex_${idx}`,
                    geometricSignature: { centroid: vertex.position },
                }),
                vertexIndex: vertex.index,
            })),
            semanticFaces,
            topologyAnalysis: this.createTopologyAnalysis(classifiedFaces, edges, vertices),
        };
    }

    /**
     * Classify faces based on primitive type
     */
    private classifyFaces(
        faces: Array<{ index: number; signature: GeometricSignature }>
    ): Array<{ stableId: StableTopologyId; faceIndex: number; semantic: PrimitiveFaceSemantics }> {
        switch (this.params.type) {
            case 'box':
                return this.classifyBoxFaces(faces);
            case 'cylinder':
                return this.classifyCylinderFaces(faces);
            case 'sphere':
                return this.classifySphereFaces(faces);
            case 'cone':
                return this.classifyConeFaces(faces);
            case 'torus':
                return this.classifyTorusFaces(faces);
            default:
                return this.classifyGenericFaces(faces);
        }
    }

    /**
     * Classify box faces by normal direction
     */
    private classifyBoxFaces(
        faces: Array<{ index: number; signature: GeometricSignature }>
    ): Array<{ stableId: StableTopologyId; faceIndex: number; semantic: PrimitiveFaceSemantics }> {
        return faces.map(face => {
            const normal = face.signature.normal || [0, 0, 0];
            let semantic: PrimitiveFaceSemantics = 'unknown';

            // Determine semantic from normal
            const [nx, ny, nz] = normal;
            const tolerance = 0.9;

            if (nz > tolerance) semantic = 'top';
            else if (nz < -tolerance) semantic = 'bottom';
            else if (ny > tolerance) semantic = 'back';
            else if (ny < -tolerance) semantic = 'front';
            else if (nx > tolerance) semantic = 'right';
            else if (nx < -tolerance) semantic = 'left';

            return {
                stableId: createPrimitiveFaceId({
                    primitiveType: 'box',
                    featureId: this.featureId,
                    operationId: this.operationId,
                    faceIndex: face.index,
                    semanticTag: semantic,
                    geometricSignature: face.signature,
                }),
                faceIndex: face.index,
                semantic,
            };
        });
    }

    /**
     * Classify cylinder faces (lateral surface + caps)
     */
    private classifyCylinderFaces(
        faces: Array<{ index: number; signature: GeometricSignature }>
    ): Array<{ stableId: StableTopologyId; faceIndex: number; semantic: PrimitiveFaceSemantics }> {
        return faces.map(face => {
            const surfaceType = face.signature.surfaceType;
            let semantic: PrimitiveFaceSemantics;

            if (surfaceType === 'cylinder') {
                semantic = 'lateral';
            } else if (surfaceType === 'plane') {
                // Determine top vs bottom by centroid Z
                const centroid = face.signature.centroid || [0, 0, 0];
                const normal = face.signature.normal || [0, 0, 0];
                semantic = normal[2] > 0 ? 'top_cap' : 'bottom_cap';
            } else {
                semantic = 'unknown';
            }

            return {
                stableId: createPrimitiveFaceId({
                    primitiveType: 'cylinder',
                    featureId: this.featureId,
                    operationId: this.operationId,
                    faceIndex: face.index,
                    semanticTag: semantic,
                    geometricSignature: face.signature,
                }),
                faceIndex: face.index,
                semantic,
            };
        });
    }

    /**
     * Classify sphere faces (single outer surface)
     */
    private classifySphereFaces(
        faces: Array<{ index: number; signature: GeometricSignature }>
    ): Array<{ stableId: StableTopologyId; faceIndex: number; semantic: PrimitiveFaceSemantics }> {
        return faces.map(face => ({
            stableId: createPrimitiveFaceId({
                primitiveType: 'sphere',
                featureId: this.featureId,
                operationId: this.operationId,
                faceIndex: face.index,
                semanticTag: 'outer',
                geometricSignature: face.signature,
            }),
            faceIndex: face.index,
            semantic: 'outer' as PrimitiveFaceSemantics,
        }));
    }

    /**
     * Classify cone faces (lateral + base cap)
     */
    private classifyConeFaces(
        faces: Array<{ index: number; signature: GeometricSignature }>
    ): Array<{ stableId: StableTopologyId; faceIndex: number; semantic: PrimitiveFaceSemantics }> {
        return faces.map(face => {
            const surfaceType = face.signature.surfaceType;
            let semantic: PrimitiveFaceSemantics;

            if (surfaceType === 'cone') {
                semantic = 'lateral';
            } else if (surfaceType === 'plane') {
                semantic = 'bottom_cap';
            } else {
                semantic = 'unknown';
            }

            return {
                stableId: createPrimitiveFaceId({
                    primitiveType: 'cone',
                    featureId: this.featureId,
                    operationId: this.operationId,
                    faceIndex: face.index,
                    semanticTag: semantic,
                    geometricSignature: face.signature,
                }),
                faceIndex: face.index,
                semantic,
            };
        });
    }

    /**
     * Classify torus faces (outer + inner)
     */
    private classifyTorusFaces(
        faces: Array<{ index: number; signature: GeometricSignature }>
    ): Array<{ stableId: StableTopologyId; faceIndex: number; semantic: PrimitiveFaceSemantics }> {
        return faces.map(face => ({
            stableId: createPrimitiveFaceId({
                primitiveType: 'torus',
                featureId: this.featureId,
                operationId: this.operationId,
                faceIndex: face.index,
                semanticTag: 'outer',
                geometricSignature: face.signature,
            }),
            faceIndex: face.index,
            semantic: 'outer' as PrimitiveFaceSemantics,
        }));
    }

    /**
     * Generic fallback classification
     */
    private classifyGenericFaces(
        faces: Array<{ index: number; signature: GeometricSignature }>
    ): Array<{ stableId: StableTopologyId; faceIndex: number; semantic: PrimitiveFaceSemantics }> {
        return faces.map((face, idx) => ({
            stableId: createStableId({
                entityType: 'face',
                sourceOperationId: this.operationId,
                featureId: this.featureId,
                generatorLinks: [],
                label: `primitive_face_${idx}`,
                geometricSignature: face.signature,
            }),
            faceIndex: face.index,
            semantic: 'unknown' as PrimitiveFaceSemantics,
        }));
    }

    /**
     * Create topology analysis for tracker
     */
    private createTopologyAnalysis(
        classifiedFaces: Array<{ stableId: StableTopologyId; faceIndex: number; semantic: PrimitiveFaceSemantics }>,
        edges: Array<{ index: number; signature: GeometricSignature }>,
        vertices: Array<{ index: number; position: [number, number, number] }>
    ): TopologyAnalysisResult {
        return {
            faces: classifiedFaces.map(f => ({
                index: f.faceIndex,
                signature: f.stableId.geometricSignature || {},
                stableId: f.stableId,
            })),
            edges: edges.map((edge, idx) => ({
                index: edge.index,
                signature: edge.signature,
                stableId: createStableId({
                    entityType: 'edge',
                    sourceOperationId: this.operationId,
                    sourceOperationName: `make${this.params.type}`,
                    featureId: this.featureId,
                    generatorLinks: [],
                    label: `${this.params.type}_edge_${idx}`,
                    geometricSignature: edge.signature,
                }),
            })),
            vertices: vertices.map((vertex, idx) => ({
                index: vertex.index,
                position: vertex.position,
                stableId: createStableId({
                    entityType: 'vertex',
                    sourceOperationId: this.operationId,
                    sourceOperationName: `make${this.params.type}`,
                    featureId: this.featureId,
                    generatorLinks: [],
                    label: `${this.params.type}_vertex_${idx}`,
                    geometricSignature: { centroid: vertex.position },
                }),
            })),
        };
    }
}

/**
 * Factory function
 */
export function analyzePrimitive(
    shape: ReplicadShape,
    featureId: string,
    operationId: string,
    params: PrimitiveParams
): PrimitiveAnalysisResult {
    const analyzer = new PrimitiveAnalyzer(shape, featureId, operationId, params);
    return analyzer.analyze();
}

/**
 * Register primitive topology with global tracker
 */
export function registerPrimitiveWithTracker(
    shape: ReplicadShape,
    featureId: string,
    operationId: string,
    params: PrimitiveParams
): PrimitiveAnalysisResult {
    const tracker = getTopologyTracker();
    tracker.beginOperation(`make${params.type}`);

    const result = analyzePrimitive(shape, featureId, operationId, params);

    // Register all faces
    for (const face of result.faces) {
        tracker.registerFace(
            featureId,
            face.faceIndex,
            face.stableId.generatorLinks,
            face.stableId.geometricSignature,
            face.stableId.label
        );
    }

    // Register edges
    for (const edge of result.edges) {
        tracker.registerEdge(
            featureId,
            edge.edgeIndex,
            edge.stableId.generatorLinks,
            edge.stableId.geometricSignature,
            edge.stableId.label
        );
    }

    // Register vertices
    for (const vertex of result.vertices) {
        tracker.registerVertex(
            featureId,
            vertex.vertexIndex,
            vertex.stableId.generatorLinks,
            vertex.stableId.geometricSignature?.centroid as [number, number, number] || [0, 0, 0],
            vertex.stableId.label
        );
    }

    tracker.endOperation();

    return result;
}

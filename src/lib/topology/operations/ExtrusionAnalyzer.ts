/**
 * Extrusion Analyzer
 * 
 * Analyzes the topology created by extrusion operations and creates
 * appropriate stable IDs with generator links tracking the lineage
 * from sketch edges to solid faces.
 * 
 * Phase 3: Operation Instrumentation
 */

import {
    StableTopologyId,
    GeneratorLink,
    GeometricSignature,
    createStableId,
    getTopologyTracker,
} from '../index';
import { ShapeAnalyzer, ReplicadShape } from '../ShapeAnalyzer';
import { TopologyAnalysisResult } from '../TopologyTracker';
import {
    SketchTopologyRegistry,
    getSketchRegistry,
} from '../SketchTopologyBridge';

// ============================================================================
// Types
// ============================================================================

/**
 * Extrusion operation parameters
 */
export interface ExtrusionParams {
    /** Source sketch ID */
    sketchId: string;

    /** Extrusion distance */
    distance: number;

    /** Extrusion direction (default: sketch normal) */
    direction?: [number, number, number];

    /** Whether to extrude in both directions */
    symmetric?: boolean;

    /** Draft angle for tapered extrusion */
    draftAngle?: number;
}

/**
 * Result of extrusion analysis
 */
export interface ExtrusionAnalysisResult {
    /** Top cap face (if closed profile) */
    topCap?: {
        stableId: StableTopologyId;
        faceIndex: number;
    };

    /** Bottom cap face (if closed profile) */
    bottomCap?: {
        stableId: StableTopologyId;
        faceIndex: number;
    };

    /** Side faces mapped to source sketch edges */
    sideFaces: Array<{
        stableId: StableTopologyId;
        faceIndex: number;
        sourceEdgeStableId?: string;
    }>;

    /** All edges with their stable IDs */
    edges: Array<{
        stableId: StableTopologyId;
        edgeIndex: number;
    }>;

    /** All vertices */
    vertices: Array<{
        stableId: StableTopologyId;
        vertexIndex: number;
    }>;

    /** Full topology analysis for tracker */
    topologyAnalysis: TopologyAnalysisResult;
}

// ============================================================================
// Extrusion Analyzer
// ============================================================================

/**
 * Analyzes an extrusion result and creates stable topology IDs
 */
export class ExtrusionAnalyzer {
    private shape: ReplicadShape;
    private featureId: string;
    private operationId: string;
    private params: ExtrusionParams;
    private shapeAnalyzer: ShapeAnalyzer;

    constructor(
        shape: ReplicadShape,
        featureId: string,
        operationId: string,
        params: ExtrusionParams
    ) {
        this.shape = shape;
        this.featureId = featureId;
        this.operationId = operationId;
        this.params = params;
        this.shapeAnalyzer = new ShapeAnalyzer(shape, featureId, operationId, 'extrude');
    }

    /**
     * Analyze the extrusion and create topology
     */
    analyze(): ExtrusionAnalysisResult {
        const faces = this.shapeAnalyzer.analyzeFaces();
        const edges = this.shapeAnalyzer.analyzeEdges();
        const vertices = this.shapeAnalyzer.analyzeVertices();

        // Get sketch registry if available
        const sketchRegistry = getSketchRegistry(this.params.sketchId);

        // Classify faces
        const { topCap, bottomCap, sideFaces } = this.classifyFaces(faces, sketchRegistry);

        // Create stable IDs for all topology
        const result: ExtrusionAnalysisResult = {
            topCap,
            bottomCap,
            sideFaces,
            edges: this.createEdgeStableIds(edges),
            vertices: this.createVertexStableIds(vertices),
            topologyAnalysis: this.createTopologyAnalysis(faces, edges, vertices, sketchRegistry),
        };

        return result;
    }

    /**
     * Classify faces into top cap, bottom cap, and sides
     */
    private classifyFaces(
        faces: Array<{ index: number; signature: GeometricSignature }>,
        sketchRegistry?: SketchTopologyRegistry
    ): {
        topCap?: { stableId: StableTopologyId; faceIndex: number };
        bottomCap?: { stableId: StableTopologyId; faceIndex: number };
        sideFaces: Array<{ stableId: StableTopologyId; faceIndex: number; sourceEdgeStableId?: string }>;
    } {
        // Determine extrusion direction (default: Z-up)
        const extrudeDir = this.params.direction || [0, 0, 1];
        const normalizedDir = this.normalizeVector(extrudeDir);

        let topCap: { stableId: StableTopologyId; faceIndex: number } | undefined;
        let bottomCap: { stableId: StableTopologyId; faceIndex: number } | undefined;
        const sideFaces: Array<{ stableId: StableTopologyId; faceIndex: number; sourceEdgeStableId?: string }> = [];

        // First pass: find top and bottom caps by normal alignment
        let topCandidateIdx = -1;
        let bottomCandidateIdx = -1;
        let topDot = -2;
        let bottomDot = 2;

        for (const face of faces) {
            if (!face.signature.normal) continue;

            const dot = this.dotProduct(face.signature.normal, normalizedDir);

            // Top cap: normal aligns with extrusion direction
            if (dot > 0.99 && dot > topDot) {
                topDot = dot;
                topCandidateIdx = face.index;
            }

            // Bottom cap: normal opposes extrusion direction
            if (dot < -0.99 && dot < bottomDot) {
                bottomDot = dot;
                bottomCandidateIdx = face.index;
            }
        }

        // Create IDs for caps
        if (topCandidateIdx >= 0) {
            const face = faces.find(f => f.index === topCandidateIdx)!;
            const generatorLinks = sketchRegistry ? [{
                type: 'extruded_from' as const,
                sourceEntityId: sketchRegistry.sketchStableId,
                semanticTag: 'top' as const,
                operationId: this.operationId,
            }] : [];

            topCap = {
                stableId: createStableId({
                    entityType: 'face',
                    sourceOperationId: this.operationId,
                    sourceOperationName: 'extrude',
                    featureId: this.featureId,
                    generatorLinks,
                    label: 'extrude_top_cap',
                    geometricSignature: face.signature,
                }),
                faceIndex: topCandidateIdx,
            };
        }

        if (bottomCandidateIdx >= 0) {
            const face = faces.find(f => f.index === bottomCandidateIdx)!;
            const generatorLinks = sketchRegistry ? [{
                type: 'extruded_from' as const,
                sourceEntityId: sketchRegistry.sketchStableId,
                semanticTag: 'bottom' as const,
                operationId: this.operationId,
            }] : [];

            bottomCap = {
                stableId: createStableId({
                    entityType: 'face',
                    sourceOperationId: this.operationId,
                    sourceOperationName: 'extrude',
                    featureId: this.featureId,
                    generatorLinks,
                    label: 'extrude_bottom_cap',
                    geometricSignature: face.signature,
                }),
                faceIndex: bottomCandidateIdx,
            };
        }

        // Remaining faces are side faces
        let sideIndex = 0;
        for (const face of faces) {
            if (face.index === topCandidateIdx || face.index === bottomCandidateIdx) {
                continue;
            }

            // Try to match to a sketch edge
            let sourceEdgeStableId: string | undefined;
            if (sketchRegistry) {
                // Find the sketch edge that generated this face
                // This would require geometric matching in a real implementation
                // For now, we use index-based heuristic
                const primitiveIds = Array.from(sketchRegistry.primitiveStableIds.values());
                if (sideIndex < primitiveIds.length) {
                    sourceEdgeStableId = primitiveIds[sideIndex];
                }
            }

            const generatorLinks: GeneratorLink[] = sourceEdgeStableId ? [{
                type: 'extruded_from',
                sourceEntityId: sourceEdgeStableId,
                semanticTag: 'side',
                operationId: this.operationId,
            }] : [];

            sideFaces.push({
                stableId: createStableId({
                    entityType: 'face',
                    sourceOperationId: this.operationId,
                    sourceOperationName: 'extrude',
                    featureId: this.featureId,
                    generatorLinks,
                    label: `extrude_side_${sideIndex}`,
                    geometricSignature: face.signature,
                }),
                faceIndex: face.index,
                sourceEdgeStableId,
            });

            sideIndex++;
        }

        return { topCap, bottomCap, sideFaces };
    }

    /**
     * Create stable IDs for edges
     */
    private createEdgeStableIds(
        edges: Array<{ index: number; signature: GeometricSignature }>
    ): Array<{ stableId: StableTopologyId; edgeIndex: number }> {
        return edges.map((edge, idx) => ({
            stableId: createStableId({
                entityType: 'edge',
                sourceOperationId: this.operationId,
                sourceOperationName: 'extrude',
                featureId: this.featureId,
                generatorLinks: [],
                label: `extrude_edge_${idx}`,
                geometricSignature: edge.signature,
            }),
            edgeIndex: edge.index,
        }));
    }

    /**
     * Create stable IDs for vertices
     */
    private createVertexStableIds(
        vertices: Array<{ index: number; position: [number, number, number] }>
    ): Array<{ stableId: StableTopologyId; vertexIndex: number }> {
        return vertices.map((vertex, idx) => ({
            stableId: createStableId({
                entityType: 'vertex',
                sourceOperationId: this.operationId,
                sourceOperationName: 'extrude',
                featureId: this.featureId,
                generatorLinks: [],
                label: `extrude_vertex_${idx}`,
                geometricSignature: { centroid: vertex.position },
            }),
            vertexIndex: vertex.index,
        }));
    }

    /**
     * Create full topology analysis for the tracker
     */
    private createTopologyAnalysis(
        faces: Array<{ index: number; signature: GeometricSignature }>,
        edges: Array<{ index: number; signature: GeometricSignature }>,
        vertices: Array<{ index: number; position: [number, number, number] }>,
        sketchRegistry?: SketchTopologyRegistry
    ): TopologyAnalysisResult {
        const extrudeDir = this.params.direction || [0, 0, 1];
        const normalizedDir = this.normalizeVector(extrudeDir);

        return {
            faces: faces.map((face, idx) => {
                const isTopCap = face.signature.normal &&
                    this.dotProduct(face.signature.normal, normalizedDir) > 0.99;
                const isBottomCap = face.signature.normal &&
                    this.dotProduct(face.signature.normal, normalizedDir) < -0.99;

                let semanticTag: 'top' | 'bottom' | 'side' = 'side';
                if (isTopCap) semanticTag = 'top';
                else if (isBottomCap) semanticTag = 'bottom';

                return {
                    index: face.index,
                    signature: face.signature,
                    stableId: createStableId({
                        entityType: 'face',
                        sourceOperationId: this.operationId,
                        sourceOperationName: 'extrude',
                        featureId: this.featureId,
                        generatorLinks: [{
                            type: 'extruded_from',
                            sourceEntityId: sketchRegistry?.sketchStableId || this.featureId,
                            semanticTag,
                            operationId: this.operationId,
                        }],
                        label: `extrude_${semanticTag}_face_${idx}`,
                        geometricSignature: face.signature,
                    }),
                };
            }),
            edges: edges.map((edge, idx) => ({
                index: edge.index,
                signature: edge.signature,
                stableId: createStableId({
                    entityType: 'edge',
                    sourceOperationId: this.operationId,
                    sourceOperationName: 'extrude',
                    featureId: this.featureId,
                    generatorLinks: [],
                    label: `extrude_edge_${idx}`,
                    geometricSignature: edge.signature,
                }),
            })),
            vertices: vertices.map((vertex, idx) => ({
                index: vertex.index,
                position: vertex.position,
                stableId: createStableId({
                    entityType: 'vertex',
                    sourceOperationId: this.operationId,
                    sourceOperationName: 'extrude',
                    featureId: this.featureId,
                    generatorLinks: [],
                    label: `extrude_vertex_${idx}`,
                    geometricSignature: { centroid: vertex.position },
                }),
            })),
        };
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    private normalizeVector(v: [number, number, number]): [number, number, number] {
        const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
        if (len < 1e-10) return [0, 0, 1];
        return [v[0] / len, v[1] / len, v[2] / len];
    }

    private dotProduct(a: [number, number, number], b: [number, number, number]): number {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
}

/**
 * Factory function to analyze an extrusion
 */
export function analyzeExtrusion(
    shape: ReplicadShape,
    featureId: string,
    operationId: string,
    params: ExtrusionParams
): ExtrusionAnalysisResult {
    const analyzer = new ExtrusionAnalyzer(shape, featureId, operationId, params);
    return analyzer.analyze();
}

/**
 * Register extrusion topology with the global tracker
 */
export function registerExtrusionWithTracker(
    shape: ReplicadShape,
    featureId: string,
    operationId: string,
    params: ExtrusionParams
): ExtrusionAnalysisResult {
    const tracker = getTopologyTracker();
    tracker.beginOperation('extrude');

    const result = analyzeExtrusion(shape, featureId, operationId, params);

    // Register all faces
    if (result.topCap) {
        tracker.registerFace(
            featureId,
            result.topCap.faceIndex,
            result.topCap.stableId.generatorLinks,
            result.topCap.stableId.geometricSignature,
            result.topCap.stableId.label
        );
    }

    if (result.bottomCap) {
        tracker.registerFace(
            featureId,
            result.bottomCap.faceIndex,
            result.bottomCap.stableId.generatorLinks,
            result.bottomCap.stableId.geometricSignature,
            result.bottomCap.stableId.label
        );
    }

    for (const sideFace of result.sideFaces) {
        tracker.registerFace(
            featureId,
            sideFace.faceIndex,
            sideFace.stableId.generatorLinks,
            sideFace.stableId.geometricSignature,
            sideFace.stableId.label
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

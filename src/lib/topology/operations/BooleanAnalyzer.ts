/**
 * Boolean Analyzer
 * 
 * Analyzes topology changes from boolean operations (fuse, cut, intersect) 
 * and creates stable IDs that track face provenance through the operation.
 * 
 * Phase 3: Operation Instrumentation
 */

import {
    StableTopologyId,
    GeneratorLink,
    GeometricSignature,
    createStableId,
    signaturesMatch,
    getTopologyTracker,
} from '../index';
import { ShapeAnalyzer, ReplicadShape } from '../ShapeAnalyzer';
import { TopologyAnalysisResult } from '../TopologyTracker';

// ============================================================================
// Types
// ============================================================================

export type BooleanOperationType = 'fuse' | 'cut' | 'intersect';

/**
 * Boolean operation parameters
 */
export interface BooleanParams {
    type: BooleanOperationType;
    toolFeatureId: string;  // The "tool" shape's feature ID
}

/**
 * Pre-operation face info (captured before boolean)
 */
export interface PreBooleanFaceInfo {
    featureId: string;
    faceIndex: number;
    stableId?: string;
    signature: GeometricSignature;
}

/**
 * Face provenance after boolean
 */
export interface BooleanFaceProvenance {
    /** Where this face came from */
    origin: 'target' | 'tool' | 'generated';

    /** Original face stable ID if from target or tool */
    originalStableId?: string;

    /** Original feature ID */
    originalFeatureId?: string;

    /** Match confidence (0-1) */
    confidence: number;
}

/**
 * Analysis result for boolean operation
 */
export interface BooleanAnalysisResult {
    /** All resulting faces with provenance */
    faces: Array<{
        stableId: StableTopologyId;
        faceIndex: number;
        provenance: BooleanFaceProvenance;
    }>;

    /** Edges */
    edges: Array<{
        stableId: StableTopologyId;
        edgeIndex: number;
    }>;

    /** Vertices */
    vertices: Array<{
        stableId: StableTopologyId;
        vertexIndex: number;
    }>;

    /** Summary statistics */
    statistics: {
        facesFromTarget: number;
        facesFromTool: number;
        generatedFaces: number;
        totalFaces: number;
    };

    /** Full topology for tracker */
    topologyAnalysis: TopologyAnalysisResult;
}

// ============================================================================
// Boolean Analyzer
// ============================================================================

/**
 * Analyzes boolean operation results and tracks face provenance
 */
export class BooleanAnalyzer {
    private resultShape: ReplicadShape;
    private featureId: string;
    private operationId: string;
    private params: BooleanParams;
    private targetFaces: PreBooleanFaceInfo[];
    private toolFaces: PreBooleanFaceInfo[];
    private shapeAnalyzer: ShapeAnalyzer;

    constructor(
        resultShape: ReplicadShape,
        featureId: string,
        operationId: string,
        params: BooleanParams,
        targetFaces: PreBooleanFaceInfo[],
        toolFaces: PreBooleanFaceInfo[]
    ) {
        this.resultShape = resultShape;
        this.featureId = featureId;
        this.operationId = operationId;
        this.params = params;
        this.targetFaces = targetFaces;
        this.toolFaces = toolFaces;
        this.shapeAnalyzer = new ShapeAnalyzer(resultShape, featureId, operationId, params.type);
    }

    /**
     * Analyze the boolean result
     */
    analyze(): BooleanAnalysisResult {
        const resultFaces = this.shapeAnalyzer.analyzeFaces();
        const resultEdges = this.shapeAnalyzer.analyzeEdges();
        const resultVertices = this.shapeAnalyzer.analyzeVertices();

        // Match result faces to original faces
        const classifiedFaces = this.classifyFaces(resultFaces);

        // Build statistics
        let facesFromTarget = 0;
        let facesFromTool = 0;
        let generatedFaces = 0;

        for (const face of classifiedFaces) {
            switch (face.provenance.origin) {
                case 'target':
                    facesFromTarget++;
                    break;
                case 'tool':
                    facesFromTool++;
                    break;
                case 'generated':
                    generatedFaces++;
                    break;
            }
        }

        return {
            faces: classifiedFaces,
            edges: resultEdges.map((edge, idx) => ({
                stableId: createStableId({
                    entityType: 'edge',
                    sourceOperationId: this.operationId,
                    sourceOperationName: this.params.type,
                    featureId: this.featureId,
                    generatorLinks: [],
                    label: `${this.params.type}_edge_${idx}`,
                    geometricSignature: edge.signature,
                }),
                edgeIndex: edge.index,
            })),
            vertices: resultVertices.map((vertex, idx) => ({
                stableId: createStableId({
                    entityType: 'vertex',
                    sourceOperationId: this.operationId,
                    sourceOperationName: this.params.type,
                    featureId: this.featureId,
                    generatorLinks: [],
                    label: `${this.params.type}_vertex_${idx}`,
                    geometricSignature: { centroid: vertex.position },
                }),
                vertexIndex: vertex.index,
            })),
            statistics: {
                facesFromTarget,
                facesFromTool,
                generatedFaces,
                totalFaces: classifiedFaces.length,
            },
            topologyAnalysis: this.createTopologyAnalysis(classifiedFaces, resultEdges, resultVertices),
        };
    }

    /**
     * Classify result faces by matching to original faces
     */
    private classifyFaces(
        resultFaces: Array<{ index: number; signature: GeometricSignature }>
    ): Array<{
        stableId: StableTopologyId;
        faceIndex: number;
        provenance: BooleanFaceProvenance;
    }> {
        const classified: Array<{
            stableId: StableTopologyId;
            faceIndex: number;
            provenance: BooleanFaceProvenance;
        }> = [];

        // Track which original faces have been matched
        const matchedTargetFaces = new Set<number>();
        const matchedToolFaces = new Set<number>();

        for (const resultFace of resultFaces) {
            let bestMatch: {
                origin: 'target' | 'tool';
                originalIndex: number;
                originalInfo: PreBooleanFaceInfo;
                confidence: number;
            } | null = null;

            // Try matching to target faces first
            for (let i = 0; i < this.targetFaces.length; i++) {
                if (matchedTargetFaces.has(i)) continue;

                const targetFace = this.targetFaces[i];
                const matchResult = signaturesMatch(resultFace.signature, targetFace.signature);

                if (matchResult.matches &&
                    (!bestMatch || matchResult.confidence > bestMatch.confidence)) {
                    bestMatch = {
                        origin: 'target',
                        originalIndex: i,
                        originalInfo: targetFace,
                        confidence: matchResult.confidence,
                    };
                }
            }

            // Try matching to tool faces
            for (let i = 0; i < this.toolFaces.length; i++) {
                if (matchedToolFaces.has(i)) continue;

                const toolFace = this.toolFaces[i];
                const matchResult = signaturesMatch(resultFace.signature, toolFace.signature);

                if (matchResult.matches &&
                    (!bestMatch || matchResult.confidence > bestMatch.confidence)) {
                    bestMatch = {
                        origin: 'tool',
                        originalIndex: i,
                        originalInfo: toolFace,
                        confidence: matchResult.confidence,
                    };
                }
            }

            if (bestMatch && bestMatch.confidence > 0.8) {
                // Good match found
                if (bestMatch.origin === 'target') {
                    matchedTargetFaces.add(bestMatch.originalIndex);
                } else {
                    matchedToolFaces.add(bestMatch.originalIndex);
                }

                const generatorLinkType = this.params.type === 'fuse' ? 'fused_with' :
                    this.params.type === 'cut' ? 'cut_by' :
                        'intersected_with';

                classified.push({
                    stableId: createStableId({
                        entityType: 'face',
                        sourceOperationId: this.operationId,
                        sourceOperationName: this.params.type,
                        featureId: this.featureId,
                        generatorLinks: [{
                            type: generatorLinkType,
                            sourceEntityId: bestMatch.originalInfo.stableId || bestMatch.originalInfo.featureId,
                            sourceIndex: bestMatch.originalInfo.faceIndex,
                            operationId: this.operationId,
                        }],
                        label: `${this.params.type}_face_from_${bestMatch.origin}_${bestMatch.originalIndex}`,
                        geometricSignature: resultFace.signature,
                    }),
                    faceIndex: resultFace.index,
                    provenance: {
                        origin: bestMatch.origin,
                        originalStableId: bestMatch.originalInfo.stableId,
                        originalFeatureId: bestMatch.originalInfo.featureId,
                        confidence: bestMatch.confidence,
                    },
                });
            } else {
                // No good match - face was generated by the boolean operation
                classified.push({
                    stableId: createStableId({
                        entityType: 'face',
                        sourceOperationId: this.operationId,
                        sourceOperationName: this.params.type,
                        featureId: this.featureId,
                        generatorLinks: [{
                            type: this.params.type === 'fuse' ? 'fused_with' :
                                this.params.type === 'cut' ? 'cut_by' :
                                    'intersected_with',
                            sourceEntityId: this.featureId,
                            semanticTag: 'generated',
                            operationId: this.operationId,
                        }],
                        label: `${this.params.type}_generated_face_${resultFace.index}`,
                        geometricSignature: resultFace.signature,
                    }),
                    faceIndex: resultFace.index,
                    provenance: {
                        origin: 'generated',
                        confidence: 0,
                    },
                });
            }
        }

        return classified;
    }

    /**
     * Create topology analysis for tracker
     */
    private createTopologyAnalysis(
        classifiedFaces: Array<{
            stableId: StableTopologyId;
            faceIndex: number;
            provenance: BooleanFaceProvenance;
        }>,
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
                    sourceOperationName: this.params.type,
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
                    sourceOperationName: this.params.type,
                    featureId: this.featureId,
                    generatorLinks: [],
                    label: `${this.params.type}_vertex_${idx}`,
                    geometricSignature: { centroid: vertex.position },
                }),
            })),
        };
    }
}

// ============================================================================
// Pre-operation Capture
// ============================================================================

/**
 * Capture face info from a shape before boolean operation
 */
export function captureFaceInfo(
    shape: ReplicadShape,
    featureId: string
): PreBooleanFaceInfo[] {
    const analyzer = new ShapeAnalyzer(shape, featureId, '', '');
    const faces = analyzer.analyzeFaces();
    const tracker = getTopologyTracker();

    return faces.map(face => {
        const stableId = tracker.getStableIdForIndex(featureId, 'face', face.index);
        return {
            featureId,
            faceIndex: face.index,
            stableId,
            signature: face.signature,
        };
    });
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Analyze a boolean operation result
 */
export function analyzeBoolean(
    resultShape: ReplicadShape,
    featureId: string,
    operationId: string,
    params: BooleanParams,
    targetFaces: PreBooleanFaceInfo[],
    toolFaces: PreBooleanFaceInfo[]
): BooleanAnalysisResult {
    const analyzer = new BooleanAnalyzer(
        resultShape, featureId, operationId, params, targetFaces, toolFaces
    );
    return analyzer.analyze();
}

/**
 * Register boolean operation with tracker
 */
export function registerBooleanWithTracker(
    resultShape: ReplicadShape,
    featureId: string,
    operationId: string,
    params: BooleanParams,
    targetFaces: PreBooleanFaceInfo[],
    toolFaces: PreBooleanFaceInfo[]
): BooleanAnalysisResult {
    const tracker = getTopologyTracker();
    tracker.beginOperation(params.type);

    const result = analyzeBoolean(
        resultShape, featureId, operationId, params, targetFaces, toolFaces
    );

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

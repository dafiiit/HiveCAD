/**
 * Topology Module
 * 
 * This module provides the complete Topological Naming System for HiveCAD.
 * It solves the "Topological Naming Problem" - ensuring that references to
 * faces, edges, and vertices survive model regeneration.
 * 
 * Core Components:
 * - StableId: Persistent identifiers for topology entities
 * - TopologyGraph: Tracks entity relationships and history
 * - TopologyReference: Smart references with fallback resolution
 * - TopologyTracker: Global service for tracking topology changes
 * - ReferenceResolver: Resolves references to current indices
 * 
 * @module topology
 */

// ============================================================================
// Core Types and Utilities
// ============================================================================

export {
    // Types
    type TopologyEntityType,
    type GeneratorLinkType,
    type SemanticTag,
    type SurfaceType,
    type CurveType,
    type GeometricSignature,
    type GeneratorLink,
    type StableTopologyId,

    // Factory Functions
    generateTopologyUUID,
    createStableId,
    createPrimitiveFaceId,
    createExtrudedFaceId,
    createFilletFaceId,

    // Serialization
    serializeStableId,
    deserializeStableId,

    // Utilities
    signaturesMatch,
    describeStableId,
} from './StableId';

// ============================================================================
// Topology Graph
// ============================================================================

export {
    // Types
    type TopologyNode,
    type TopologySnapshot,
    type SerializedTopologySnapshot,

    // Class
    TopologyGraph,
} from './TopologyGraph';

// ============================================================================
// Topology Reference
// ============================================================================

export {
    // Types
    type SemanticSelectorType,
    type SemanticSelector,
    type GeometricSelector,
    type TopologyReference,

    // Factory Functions
    createReferenceFromSelection,
    createSemanticReference,
    createTopFaceReference,
    createBottomFaceReference,
    createLargestFaceReference,
    createParallelFaceReference,

    // Utilities
    hasStableId,
    hasSelector,
    isIndexOnlyReference,
    getReferencePriority,
    serializeReference,
    deserializeReference,
    describeReference,
    cloneReference,
    updateReferenceStableId,

    // Legacy Compatibility
    parseSelectionId,
    toSelectionId,
    isFaceSelection,
    isEdgeSelection,
    isVertexSelection,
} from './TopologyReference';

// ============================================================================
// Topology Tracker
// ============================================================================

export {
    // Types
    type IndexToIdMapping,
    type FeatureTopologyMapping,
    type TopologyAnalysisResult,

    // Class and Singleton
    TopologyTracker,
    getTopologyTracker,
} from './TopologyTracker';

// ============================================================================
// Reference Resolver
// ============================================================================

export {
    // Types
    type ResolveResult,
    type ShapeAnalysis,
    type ResolveOptions,

    // Class and Singleton
    ReferenceResolver,
    getReferenceResolver,
} from './ReferenceResolver';

// ============================================================================
// Shape Analyzer
// ============================================================================

export {
    // Types
    type ReplicadShape,
    type ReplicadFace,
    type ReplicadEdge,
    type ReplicadVertex,

    // Class and Factory
    ShapeAnalyzer,
    analyzeShape,
} from './ShapeAnalyzer';

// ============================================================================
// Sketch Topology Bridge
// ============================================================================

export {
    // Types
    type TaggedSketchPrimitive,
    type SketchTopologyRegistry,
    type SketchToFaceMapping,

    // Primitive Tagging
    tagPrimitive,
    tagAllPrimitives,
    hashPoint,
    getPointStableId,

    // Registry Management
    createSketchRegistry,
    getSketchRegistry,
    registerPrimitive,
    clearSketchRegistry,
    clearAllSketchRegistries,

    // Generator Links
    createExtrusionGeneratorLinks,
    createRevolutionGeneratorLinks,
    createFilletGeneratorLinks,
    createBooleanGeneratorLinks,
    createExtrusionMapping,

    // Serialization
    serializeSketchRegistry,
    deserializeSketchRegistry,
    serializeAllRegistries,
    deserializeAllRegistries,

    // Tracker Integration
    registerSketchWithTracker,
} from './SketchTopologyBridge';

// ============================================================================
// Operation Analyzers
// ============================================================================

export {
    // Extrusion
    ExtrusionAnalyzer,
    analyzeExtrusion,
    registerExtrusionWithTracker,
    type ExtrusionParams,
    type ExtrusionAnalysisResult,

    // Primitives
    PrimitiveAnalyzer,
    analyzePrimitive,
    registerPrimitiveWithTracker,
    type PrimitiveType,
    type PrimitiveParams,
    type PrimitiveFaceSemantics,
    type PrimitiveAnalysisResult,

    // Boolean
    BooleanAnalyzer,
    analyzeBoolean,
    registerBooleanWithTracker,
    captureFaceInfo,
    type BooleanOperationType,
    type BooleanParams,
    type PreBooleanFaceInfo,
    type BooleanFaceProvenance,
    type BooleanAnalysisResult,

    // Fillet
    FilletAnalyzer,
    analyzeFillet,
    registerFilletWithTracker,
    captureEdgeInfo,
    captureFaceInfoForFillet,
    type FilletOperationType,
    type FilletParams,
    type PreFilletEdgeInfo,
    type PreFilletFaceInfo,
    type FilletAnalysisResult,
} from './operations';

// ============================================================================
// Legacy Types (Deprecated - for backward compatibility)
// ============================================================================

/**
 * @deprecated Use the new TopologyReference from './TopologyReference' instead.
 * This interface is kept for backward compatibility.
 */
export interface LegacyTopologyReference {
    /** Type of topological element */
    type: 'face' | 'edge' | 'vertex';

    /** The ID of the base solid/body object */
    baseObjectId: string;

    /** Display-time index (from faceMapping/edgeMapping) */
    index: number;

    /** Optional stable selector for future robustness */
    selector?: LegacyTopologySelector;
}

/**
 * @deprecated Use SemanticSelector or GeometricSelector instead.
 */
export interface LegacyTopologySelector {
    type: 'index' | 'parallel_to_plane' | 'normal_vector' | 'largest' | 'at_position';
    params: Record<string, any>;
}

/**
 * @deprecated Use parseSelectionId from './TopologyReference' instead.
 * This function is an alias for backward compatibility.
 */
export function parseLegacySelectionId(selectionId: string): LegacyTopologyReference | null {
    // Import at function level to avoid circular dependency issues
    const { parseSelectionId: parseRef } = require('./TopologyReference');
    const result = parseRef(selectionId);
    if (!result) return null;

    return {
        type: result.type,
        baseObjectId: result.baseObjectId,
        index: result.indexHint ?? 0,
    };
}


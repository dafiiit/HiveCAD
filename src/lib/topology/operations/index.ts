/**
 * Operation Analyzers - Index
 * 
 * Exports all operation analyzers for topology tracking.
 * 
 * @module topology/operations
 */

// Extrusion Analysis
export {
    ExtrusionAnalyzer,
    analyzeExtrusion,
    registerExtrusionWithTracker,
    type ExtrusionParams,
    type ExtrusionAnalysisResult,
} from './ExtrusionAnalyzer';

// Primitive Analysis
export {
    PrimitiveAnalyzer,
    analyzePrimitive,
    registerPrimitiveWithTracker,
    type PrimitiveType,
    type PrimitiveParams,
    type PrimitiveFaceSemantics,
    type PrimitiveAnalysisResult,
} from './PrimitiveAnalyzer';

// Boolean Analysis
export {
    BooleanAnalyzer,
    analyzeBoolean,
    registerBooleanWithTracker,
    captureFaceInfo,
    type BooleanOperationType,
    type BooleanParams,
    type PreBooleanFaceInfo,
    type BooleanFaceProvenance,
    type BooleanAnalysisResult,
} from './BooleanAnalyzer';

// Fillet/Chamfer Analysis
export {
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
} from './FilletAnalyzer';

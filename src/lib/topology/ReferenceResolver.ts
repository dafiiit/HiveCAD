/**
 * Reference Resolver
 * 
 * This module resolves TopologyReferences to current display indices.
 * It implements a multi-strategy resolution approach:
 * 
 * 1. Exact match by stable ID
 * 2. Semantic selector resolution
 * 3. Geometric selector fuzzy matching
 * 4. Index hint fallback
 * 
 * Each strategy has a confidence level, and the resolver returns
 * the best match above a minimum confidence threshold.
 */

import {
    TopologyReference,
    SemanticSelector,
    GeometricSelector,
    isIndexOnlyReference,
} from './TopologyReference';
import { TopologyEntityType, GeometricSignature } from './StableId';
import { TopologyTracker, getTopologyTracker } from './TopologyTracker';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of resolving a topology reference
 */
export interface ResolveResult {
    /** Was the resolution successful? */
    success: boolean;

    /** The resolved display index (if successful) */
    index?: number;

    /** The stable ID of the resolved entity (for caching) */
    stableId?: string;

    /** Confidence level of the resolution (0-1) */
    confidence: number;

    /** Which resolution strategy was used */
    strategy: 'stableId' | 'semantic' | 'geometric' | 'indexHint' | 'failed';

    /** Error message if resolution failed */
    error?: string;

    /** Alternative candidates if the match is uncertain */
    alternatives?: Array<{
        index: number;
        confidence: number;
        stableId?: string;
    }>;
}

/**
 * Shape analysis interface (provided by the CAD kernel)
 */
export interface ShapeAnalysis {
    /** Get the number of faces */
    getFaceCount(): number;

    /** Get the number of edges */
    getEdgeCount(): number;

    /** Get the number of vertices */
    getVertexCount(): number;

    /** Get geometric signature for a face */
    getFaceSignature(index: number): GeometricSignature;

    /** Get geometric signature for an edge */
    getEdgeSignature(index: number): GeometricSignature;

    /** Get vertex position */
    getVertexPosition(index: number): [number, number, number];
}

/**
 * Options for resolution
 */
export interface ResolveOptions {
    /** Minimum confidence required for a match */
    minConfidence?: number;

    /** Use cached result if available */
    useCache?: boolean;

    /** Maximum alternatives to return */
    maxAlternatives?: number;

    /** Shape analysis for semantic/geometric resolution */
    shapeAnalysis?: ShapeAnalysis;
}

// ============================================================================
// Reference Resolver Class
// ============================================================================

/**
 * Resolves TopologyReferences to current display indices.
 */
export class ReferenceResolver {
    private tracker: TopologyTracker;

    constructor(tracker?: TopologyTracker) {
        this.tracker = tracker || getTopologyTracker();
    }

    /**
     * Resolve a topology reference to a display index
     */
    resolve(
        ref: TopologyReference,
        options: ResolveOptions = {}
    ): ResolveResult {
        const {
            minConfidence = 0.7,
            useCache = true,
            maxAlternatives = 3,
            shapeAnalysis,
        } = options;

        // Check cache
        if (useCache && ref._cached) {
            const cacheAge = Date.now() - ref._cached.resolvedAt;
            if (cacheAge < 5000) { // 5 second cache validity
                return {
                    success: true,
                    index: ref._cached.resolvedIndex,
                    stableId: ref.stableId,
                    confidence: ref._cached.confidence,
                    strategy: 'stableId',
                };
            }
        }

        // Strategy 1: Resolve by stable ID
        if (ref.stableId) {
            const result = this.resolveByStableId(ref);
            if (result.success && result.confidence >= minConfidence) {
                this.cacheResult(ref, result);
                return result;
            }
        }

        // Strategy 2: Resolve by semantic selector
        if (ref.semanticSelector && shapeAnalysis) {
            const result = this.resolveBySemanticSelector(ref, shapeAnalysis);
            if (result.success && result.confidence >= minConfidence) {
                this.cacheResult(ref, result);
                return result;
            }
        }

        // Strategy 3: Resolve by geometric selector
        if (ref.geometricSelector && shapeAnalysis) {
            const result = this.resolveByGeometricSelector(ref, shapeAnalysis, maxAlternatives);
            if (result.success && result.confidence >= minConfidence) {
                this.cacheResult(ref, result);
                return result;
            }
        }

        // Strategy 4: Fall back to index hint
        if (ref.indexHint !== undefined) {
            return {
                success: true,
                index: ref.indexHint,
                confidence: 0.3, // Low confidence for index-only
                strategy: 'indexHint',
            };
        }

        // Failed to resolve
        return {
            success: false,
            confidence: 0,
            strategy: 'failed',
            error: 'No resolution strategy succeeded',
        };
    }

    /**
     * Resolve by stable ID lookup
     */
    private resolveByStableId(ref: TopologyReference): ResolveResult {
        if (!ref.stableId) {
            return {
                success: false,
                confidence: 0,
                strategy: 'stableId',
                error: 'No stable ID provided',
            };
        }

        const stableId = this.tracker.getStableId(ref.stableId);
        if (!stableId || !stableId.isAlive) {
            return {
                success: false,
                confidence: 0,
                strategy: 'stableId',
                error: stableId ? 'Entity no longer exists' : 'Stable ID not found',
            };
        }

        const index = this.tracker.getIndexForStableId(
            ref.baseObjectId,
            ref.type,
            ref.stableId
        );

        if (index === undefined) {
            return {
                success: false,
                confidence: 0,
                strategy: 'stableId',
                error: 'Index not found for stable ID',
            };
        }

        return {
            success: true,
            index,
            stableId: ref.stableId,
            confidence: 1.0,
            strategy: 'stableId',
        };
    }

    /**
     * Resolve by semantic selector
     */
    private resolveBySemanticSelector(
        ref: TopologyReference,
        shapeAnalysis: ShapeAnalysis
    ): ResolveResult {
        if (!ref.semanticSelector) {
            return {
                success: false,
                confidence: 0,
                strategy: 'semantic',
                error: 'No semantic selector provided',
            };
        }

        const selector = ref.semanticSelector;
        const entityType = ref.type;

        if (entityType === 'face') {
            const count = shapeAnalysis.getFaceCount();
            if (count === 0) {
                return {
                    success: false,
                    confidence: 0,
                    strategy: 'semantic',
                    error: 'Shape has no faces',
                };
            }

            const result = this.resolveFaceSemanticSelector(selector, shapeAnalysis, count);
            return result;
        }

        if (entityType === 'edge') {
            const count = shapeAnalysis.getEdgeCount();
            if (count === 0) {
                return {
                    success: false,
                    confidence: 0,
                    strategy: 'semantic',
                    error: 'Shape has no edges',
                };
            }

            const result = this.resolveEdgeSemanticSelector(selector, shapeAnalysis, count);
            return result;
        }

        return {
            success: false,
            confidence: 0,
            strategy: 'semantic',
            error: `Semantic selection not supported for ${entityType}`,
        };
    }

    /**
     * Resolve face semantic selector
     */
    private resolveFaceSemanticSelector(
        selector: SemanticSelector,
        shapeAnalysis: ShapeAnalysis,
        count: number
    ): ResolveResult {
        switch (selector.type) {
            case 'topmost': {
                let topIndex = 0;
                let topZ = -Infinity;
                for (let i = 0; i < count; i++) {
                    const sig = shapeAnalysis.getFaceSignature(i);
                    if (sig.centroid && sig.centroid[2] > topZ) {
                        topZ = sig.centroid[2];
                        topIndex = i;
                    }
                }
                return { success: true, index: topIndex, confidence: 0.9, strategy: 'semantic' };
            }

            case 'bottommost': {
                let bottomIndex = 0;
                let bottomZ = Infinity;
                for (let i = 0; i < count; i++) {
                    const sig = shapeAnalysis.getFaceSignature(i);
                    if (sig.centroid && sig.centroid[2] < bottomZ) {
                        bottomZ = sig.centroid[2];
                        bottomIndex = i;
                    }
                }
                return { success: true, index: bottomIndex, confidence: 0.9, strategy: 'semantic' };
            }

            case 'largest': {
                let largestIndex = 0;
                let largestArea = 0;
                for (let i = 0; i < count; i++) {
                    const sig = shapeAnalysis.getFaceSignature(i);
                    if (sig.area !== undefined && sig.area > largestArea) {
                        largestArea = sig.area;
                        largestIndex = i;
                    }
                }
                return { success: true, index: largestIndex, confidence: 0.9, strategy: 'semantic' };
            }

            case 'smallest': {
                let smallestIndex = 0;
                let smallestArea = Infinity;
                for (let i = 0; i < count; i++) {
                    const sig = shapeAnalysis.getFaceSignature(i);
                    if (sig.area !== undefined && sig.area < smallestArea) {
                        smallestArea = sig.area;
                        smallestIndex = i;
                    }
                }
                return { success: true, index: smallestIndex, confidence: 0.9, strategy: 'semantic' };
            }

            case 'parallel_to_plane': {
                const targetNormal = selector.params?.direction;
                if (!targetNormal) {
                    return { success: false, confidence: 0, strategy: 'semantic', error: 'No direction specified' };
                }

                let bestIndex = -1;
                let bestDot = -1;
                for (let i = 0; i < count; i++) {
                    const sig = shapeAnalysis.getFaceSignature(i);
                    if (sig.normal) {
                        const dot = Math.abs(this.vectorDot(sig.normal, targetNormal));
                        if (dot > bestDot) {
                            bestDot = dot;
                            bestIndex = i;
                        }
                    }
                }

                if (bestIndex >= 0 && bestDot > 0.99) {
                    return { success: true, index: bestIndex, confidence: bestDot, strategy: 'semantic' };
                }
                return { success: false, confidence: 0, strategy: 'semantic', error: 'No parallel face found' };
            }

            case 'perpendicular_to': {
                const targetDir = selector.params?.direction;
                if (!targetDir) {
                    return { success: false, confidence: 0, strategy: 'semantic', error: 'No direction specified' };
                }

                let bestIndex = -1;
                let bestDot = 1;
                for (let i = 0; i < count; i++) {
                    const sig = shapeAnalysis.getFaceSignature(i);
                    if (sig.normal) {
                        const dot = Math.abs(this.vectorDot(sig.normal, targetDir));
                        if (dot < bestDot) {
                            bestDot = dot;
                            bestIndex = i;
                        }
                    }
                }

                if (bestIndex >= 0 && bestDot < 0.01) {
                    return { success: true, index: bestIndex, confidence: 1 - bestDot, strategy: 'semantic' };
                }
                return { success: false, confidence: 0, strategy: 'semantic', error: 'No perpendicular face found' };
            }

            case 'at_position': {
                const targetPos = selector.params?.position;
                const tolerance = selector.params?.tolerance || 1;
                if (!targetPos) {
                    return { success: false, confidence: 0, strategy: 'semantic', error: 'No position specified' };
                }

                let bestIndex = -1;
                let bestDist = Infinity;
                for (let i = 0; i < count; i++) {
                    const sig = shapeAnalysis.getFaceSignature(i);
                    if (sig.centroid) {
                        const dist = this.vectorDistance(sig.centroid, targetPos);
                        if (dist < bestDist) {
                            bestDist = dist;
                            bestIndex = i;
                        }
                    }
                }

                if (bestIndex >= 0 && bestDist < tolerance) {
                    const confidence = Math.max(0, 1 - bestDist / tolerance);
                    return { success: true, index: bestIndex, confidence, strategy: 'semantic' };
                }
                return { success: false, confidence: 0, strategy: 'semantic', error: 'No face at position' };
            }

            default:
                return { success: false, confidence: 0, strategy: 'semantic', error: `Unknown selector type: ${selector.type}` };
        }
    }

    /**
     * Resolve edge semantic selector
     */
    private resolveEdgeSemanticSelector(
        selector: SemanticSelector,
        shapeAnalysis: ShapeAnalysis,
        count: number
    ): ResolveResult {
        switch (selector.type) {
            case 'longest': {
                let longestIndex = 0;
                let longestLength = 0;
                for (let i = 0; i < count; i++) {
                    const sig = shapeAnalysis.getEdgeSignature(i);
                    if (sig.length !== undefined && sig.length > longestLength) {
                        longestLength = sig.length;
                        longestIndex = i;
                    }
                }
                return { success: true, index: longestIndex, confidence: 0.9, strategy: 'semantic' };
            }

            case 'shortest': {
                let shortestIndex = 0;
                let shortestLength = Infinity;
                for (let i = 0; i < count; i++) {
                    const sig = shapeAnalysis.getEdgeSignature(i);
                    if (sig.length !== undefined && sig.length < shortestLength) {
                        shortestLength = sig.length;
                        shortestIndex = i;
                    }
                }
                return { success: true, index: shortestIndex, confidence: 0.9, strategy: 'semantic' };
            }

            default:
                return { success: false, confidence: 0, strategy: 'semantic', error: `Selector ${selector.type} not supported for edges` };
        }
    }

    /**
     * Resolve by geometric selector (fuzzy matching)
     */
    private resolveByGeometricSelector(
        ref: TopologyReference,
        shapeAnalysis: ShapeAnalysis,
        maxAlternatives: number
    ): ResolveResult {
        if (!ref.geometricSelector) {
            return {
                success: false,
                confidence: 0,
                strategy: 'geometric',
                error: 'No geometric selector provided',
            };
        }

        const selector = ref.geometricSelector;
        const entityType = ref.type;

        let count: number;
        let getSignature: (index: number) => GeometricSignature;

        if (entityType === 'face') {
            count = shapeAnalysis.getFaceCount();
            getSignature = (i) => shapeAnalysis.getFaceSignature(i);
        } else if (entityType === 'edge') {
            count = shapeAnalysis.getEdgeCount();
            getSignature = (i) => shapeAnalysis.getEdgeSignature(i);
        } else {
            return {
                success: false,
                confidence: 0,
                strategy: 'geometric',
                error: `Geometric selection not supported for ${entityType}`,
            };
        }

        if (count === 0) {
            return {
                success: false,
                confidence: 0,
                strategy: 'geometric',
                error: 'Shape has no entities of this type',
            };
        }

        // Score each entity
        const scores: Array<{ index: number; score: number }> = [];
        for (let i = 0; i < count; i++) {
            const sig = getSignature(i);
            const score = this.computeGeometricScore(selector, sig);
            scores.push({ index: i, score });
        }

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);

        if (scores.length === 0 || scores[0].score < 0.5) {
            return {
                success: false,
                confidence: 0,
                strategy: 'geometric',
                error: 'No geometric match found',
            };
        }

        const alternatives = scores.slice(1, maxAlternatives + 1).map(s => ({
            index: s.index,
            confidence: s.score,
        }));

        return {
            success: true,
            index: scores[0].index,
            confidence: scores[0].score,
            strategy: 'geometric',
            alternatives,
        };
    }

    /**
     * Compute geometric match score
     */
    private computeGeometricScore(selector: GeometricSelector, sig: GeometricSignature): number {
        let totalScore = 0;
        let maxScore = 0;

        // Position matching
        if (selector.centroidPosition && sig.centroid) {
            const tolerance = selector.positionTolerance || 1;
            const dist = this.vectorDistance(sig.centroid, selector.centroidPosition);
            if (dist < tolerance) {
                totalScore += 3 * (1 - dist / tolerance);
            }
            maxScore += 3;
        }

        // Normal matching
        if (selector.normalDirection && sig.normal) {
            const tolerance = selector.normalTolerance || 0.1;
            const dot = this.vectorDot(sig.normal, selector.normalDirection);
            if (Math.abs(dot - 1) < tolerance) {
                totalScore += 2 * (1 - Math.abs(dot - 1) / tolerance);
            }
            maxScore += 2;
        }

        // Area matching
        if (selector.areaRange && sig.area !== undefined) {
            const { min, max } = selector.areaRange;
            const inRange = (min === undefined || sig.area >= min) &&
                (max === undefined || sig.area <= max);
            if (inRange) {
                totalScore += 2;
            }
            maxScore += 2;
        }

        // Length matching
        if (selector.lengthRange && sig.length !== undefined) {
            const { min, max } = selector.lengthRange;
            const inRange = (min === undefined || sig.length >= min) &&
                (max === undefined || sig.length <= max);
            if (inRange) {
                totalScore += 2;
            }
            maxScore += 2;
        }

        // Surface type matching
        if (selector.surfaceType && sig.surfaceType) {
            if (selector.surfaceType === sig.surfaceType) {
                totalScore += 1;
            }
            maxScore += 1;
        }

        // Curve type matching
        if (selector.curveType && sig.curveType) {
            if (selector.curveType === sig.curveType) {
                totalScore += 1;
            }
            maxScore += 1;
        }

        // Edge count matching
        if (selector.minEdgeCount !== undefined || selector.maxEdgeCount !== undefined) {
            const edgeCount = sig.edgeCount || 0;
            const minOk = selector.minEdgeCount === undefined || edgeCount >= selector.minEdgeCount;
            const maxOk = selector.maxEdgeCount === undefined || edgeCount <= selector.maxEdgeCount;
            if (minOk && maxOk) {
                totalScore += 1;
            }
            maxScore += 1;
        }

        return maxScore > 0 ? totalScore / maxScore : 0;
    }

    /**
     * Cache a resolution result
     */
    private cacheResult(ref: TopologyReference, result: ResolveResult): void {
        if (result.success && result.index !== undefined) {
            ref._cached = {
                resolvedIndex: result.index,
                resolvedAt: Date.now(),
                confidence: result.confidence,
            };
        }
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    private vectorDot(a: [number, number, number], b: [number, number, number]): number {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    private vectorDistance(a: [number, number, number], b: [number, number, number]): number {
        return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
    }

    // ========================================================================
    // Batch Resolution
    // ========================================================================

    /**
     * Resolve multiple references at once
     */
    resolveAll(
        refs: TopologyReference[],
        options: ResolveOptions = {}
    ): Map<TopologyReference, ResolveResult> {
        const results = new Map<TopologyReference, ResolveResult>();
        for (const ref of refs) {
            results.set(ref, this.resolve(ref, options));
        }
        return results;
    }

    /**
     * Check if a reference is likely to be resolvable
     */
    canResolve(ref: TopologyReference): boolean {
        return !!(
            ref.stableId ||
            ref.semanticSelector ||
            ref.geometricSelector ||
            ref.indexHint !== undefined
        );
    }

    /**
     * Get the best available description for a reference
     */
    describeResolution(result: ResolveResult): string {
        if (!result.success) {
            return `Failed: ${result.error || 'Unknown error'}`;
        }

        const confidence = (result.confidence * 100).toFixed(0);
        return `Index ${result.index} (${result.strategy}, ${confidence}% confidence)`;
    }
}

// Export singleton factory
let resolverInstance: ReferenceResolver | null = null;

export function getReferenceResolver(): ReferenceResolver {
    if (!resolverInstance) {
        resolverInstance = new ReferenceResolver();
    }
    return resolverInstance;
}

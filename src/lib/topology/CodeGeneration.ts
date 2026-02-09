/**
 * Code Generation with Stable References
 * 
 * Provides utilities for generating code that uses stable topological
 * references instead of transient indices.
 * 
 * Phase 6: Code Manager Integration
 */

import {
    TopologyReference,
    StableTopologyId,
    SemanticSelector,
    GeometricSelector,
    createReferenceFromSelection,
    createSemanticReference,
    TopologyEntityType,
    SemanticSelectorType,
} from './index';


// ============================================================================
// Code Generation Types
// ============================================================================

/**
 * Options for generating reference code
 */
export interface ReferenceCodeOptions {
    /** Include stable ID in generated code */
    includeStableId?: boolean;

    /** Include semantic selector as fallback */
    includeSemanticFallback?: boolean;

    /** Include geometric selector as fallback */
    includeGeometricFallback?: boolean;

    /** Include index hint as last resort fallback */
    includeIndexHint?: boolean;

    /** Use compact format (single line) */
    compact?: boolean;
}

/**
 * Selector function type for code generation
 */
export type SelectorFunctionType =
    | 'selectFace'
    | 'selectEdge'
    | 'selectVertex'
    | 'selectByStableId'
    | 'selectByNormal'
    | 'selectByPosition'
    | 'selectTopmost'
    | 'selectBottommost'
    | 'selectLargest'
    | 'selectSmallest';

// ============================================================================
// Reference Code Generator
// ============================================================================

/**
 * Generates code for a stable topology reference
 */
export class ReferenceCodeGenerator {
    private options: ReferenceCodeOptions;

    constructor(options: ReferenceCodeOptions = {}) {
        this.options = {
            includeStableId: true,
            includeSemanticFallback: true,
            includeGeometricFallback: true,
            includeIndexHint: true,
            compact: false,
            ...options,
        };
    }

    /**
     * Generate code for a reference
     */
    generateReferenceCode(reference: TopologyReference): string {
        const funcName = this.getSelectorFunction(reference);
        const args = this.buildArgumentList(reference);

        if (this.options.compact) {
            return `${funcName}(${reference.baseObjectId}, ${args.join(', ')})`;
        }

        return `${funcName}(${reference.baseObjectId}, {\n${args.map(a => `  ${a}`).join(',\n')}\n})`;
    }

    /**
     * Generate a face selection expression
     */
    generateFaceSelector(
        objectId: string,
        stableId?: string,
        semantic?: SemanticSelector,
        geometric?: GeometricSelector,
        indexHint?: number
    ): string {
        const reference = this.createReference('face', objectId, stableId, semantic, geometric, indexHint);
        return this.generateReferenceCode(reference);
    }

    /**
     * Generate an edge selection expression
     */
    generateEdgeSelector(
        objectId: string,
        stableId?: string,
        semantic?: SemanticSelector,
        geometric?: GeometricSelector,
        indexHint?: number
    ): string {
        const reference = this.createReference('edge', objectId, stableId, semantic, geometric, indexHint);
        return this.generateReferenceCode(reference);
    }

    /**
     * Create a TopologyReference from parameters
     */
    private createReference(
        type: TopologyEntityType,
        baseObjectId: string,
        stableId?: string,
        semantic?: SemanticSelector,
        geometric?: GeometricSelector,
        indexHint?: number
    ): TopologyReference {
        return {
            type,
            baseObjectId,
            stableId,
            semanticSelector: semantic,
            geometricSelector: geometric,
            indexHint,
        };
    }

    /**
     * Generate a semantic selector
     */
    generateSemanticSelector(
        objectId: string,
        entityType: TopologyEntityType,
        semanticType: SemanticSelector['type'],
        params?: Record<string, any>
    ): string {
        const semantic: SemanticSelector = { type: semanticType, params };
        const funcName = this.getSemanticFunction(semanticType);

        if (params && Object.keys(params).length > 0) {
            return `${funcName}(${objectId}, ${JSON.stringify(params)})`;
        }
        return `${funcName}(${objectId})`;
    }

    /**
     * Generate a geometric selector
     */
    generateGeometricSelector(
        objectId: string,
        entityType: TopologyEntityType,
        geometric: GeometricSelector
    ): string {
        const parts: string[] = [];

        if (geometric.normalDirection) {
            parts.push(`normalDirection: [${geometric.normalDirection.join(', ')}]`);
        }
        if (geometric.normalTolerance !== undefined) {
            parts.push(`normalTolerance: ${geometric.normalTolerance}`);
        }
        if (geometric.centroidPosition) {
            parts.push(`centroidPosition: [${geometric.centroidPosition.join(', ')}]`);
        }
        if (geometric.positionTolerance !== undefined) {
            parts.push(`positionTolerance: ${geometric.positionTolerance}`);
        }
        if (geometric.areaRange) {
            parts.push(`areaRange: { min: ${geometric.areaRange.min ?? 0}, max: ${geometric.areaRange.max ?? 'Infinity'} }`);
        }

        const funcName = entityType === 'face' ? 'selectFaceByGeometry' :
            entityType === 'edge' ? 'selectEdgeByGeometry' :
                'selectVertexByGeometry';

        return `${funcName}(${objectId}, {\n  ${parts.join(',\n  ')}\n})`;
    }

    /**
     * Generate code for fillet operation with stable reference
     */
    generateFilletCode(
        sourceObject: string,
        edgeReference: TopologyReference,
        radius: number
    ): string {
        const refCode = this.generateReferenceCode(edgeReference);
        return `${sourceObject}.fillet(${radius}, (e) => ${refCode})`;
    }

    /**
     * Generate code for chamfer operation with stable reference
     */
    generateChamferCode(
        sourceObject: string,
        edgeReference: TopologyReference,
        distance: number
    ): string {
        const refCode = this.generateReferenceCode(edgeReference);
        return `${sourceObject}.chamfer(${distance}, (e) => ${refCode})`;
    }

    /**
     * Generate code for face extrusion with stable reference
     */
    generateFaceExtrusionCode(
        sourceObject: string,
        faceReference: TopologyReference,
        distance: number,
        options?: { fuseWithOriginal?: boolean }
    ): string {
        const refCode = this.generateReferenceCode(faceReference);
        const optStr = options ? `, ${JSON.stringify(options)}` : '';
        return `extrudeFace(${sourceObject}, ${refCode}, ${distance}${optStr})`;
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private getSelectorFunction(ref: TopologyReference): SelectorFunctionType {
        switch (ref.type) {
            case 'face': return 'selectFace';
            case 'edge': return 'selectEdge';
            case 'vertex': return 'selectVertex';
            default: return 'selectFace';
        }
    }

    private getSemanticFunction(type: SemanticSelectorType): string {
        switch (type) {
            case 'topmost': return 'selectTopmost';
            case 'bottommost': return 'selectBottommost';
            case 'largest': return 'selectLargest';
            case 'smallest': return 'selectSmallest';
            case 'parallel_to_plane': return 'selectParallelTo';
            case 'perpendicular_to': return 'selectPerpendicularTo';
            case 'at_position': return 'selectAtPosition';
            default: return 'selectByProperty';
        }
    }

    private buildArgumentList(ref: TopologyReference): string[] {
        const args: string[] = [];

        if (this.options.includeStableId && ref.stableId) {
            args.push(`stableId: "${ref.stableId}"`);
        }

        if (this.options.includeSemanticFallback && ref.semanticSelector) {
            const semanticStr = ref.semanticSelector.params
                ? `{ type: "${ref.semanticSelector.type}", params: ${JSON.stringify(ref.semanticSelector.params)} }`
                : `{ type: "${ref.semanticSelector.type}" }`;
            args.push(`semantic: ${semanticStr}`);
        }

        if (this.options.includeGeometricFallback && ref.geometricSelector) {
            const geoArgs: string[] = [];
            const geo = ref.geometricSelector;

            if (geo.normalDirection) {
                geoArgs.push(`normalDirection: [${geo.normalDirection.join(', ')}]`);
            }
            if (geo.centroidPosition) {
                geoArgs.push(`centroidPosition: [${geo.centroidPosition.join(', ')}]`);
            }
            if (geo.areaRange) {
                geoArgs.push(`areaRange: ${JSON.stringify(geo.areaRange)}`);
            }

            if (geoArgs.length > 0) {
                args.push(`geometric: {\n    ${geoArgs.join(',\n    ')}\n  }`);
            }
        }

        if (this.options.includeIndexHint && ref.indexHint !== undefined) {
            args.push(`indexHint: ${ref.indexHint}`);
        }

        return args;
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a reference code generator with default options
 */
export function createReferenceCodeGenerator(options?: ReferenceCodeOptions): ReferenceCodeGenerator {
    return new ReferenceCodeGenerator(options);
}

/**
 * Quick helper to generate face selection code
 */
export function generateFaceSelectionCode(
    objectId: string,
    options: {
        stableId?: string;
        semanticType?: SemanticSelector['type'];
        normal?: [number, number, number];
        position?: [number, number, number];
        index?: number;
    }
): string {
    const generator = new ReferenceCodeGenerator({ compact: true });

    const semantic = options.semanticType ? { type: options.semanticType } : undefined;
    const geometric = (options.normal || options.position) ? {
        normalDirection: options.normal,
        centroidPosition: options.position,
    } : undefined;

    return generator.generateFaceSelector(
        objectId,
        options.stableId,
        semantic,
        geometric,
        options.index
    );
}

/**
 * Quick helper to generate edge selection code
 */
export function generateEdgeSelectionCode(
    objectId: string,
    options: {
        stableId?: string;
        semanticType?: SemanticSelector['type'];
        direction?: [number, number, number];
        position?: [number, number, number];
        index?: number;
    }
): string {
    const generator = new ReferenceCodeGenerator({ compact: true });

    const semantic = options.semanticType ? { type: options.semanticType } : undefined;
    const geometric = (options.direction || options.position) ? {
        normalDirection: options.direction,
        centroidPosition: options.position,
    } : undefined;

    return generator.generateEdgeSelector(
        objectId,
        options.stableId,
        semantic,
        geometric,
        options.index
    );
}

// ============================================================================
// Code Transformation Utilities
// ============================================================================

/**
 * Transform legacy index-based reference to stable reference
 */
export function transformIndexToStableReference(
    code: string,
    objectId: string,
    entityType: TopologyEntityType,
    oldIndex: number,
    stableId: string,
    semantic?: SemanticSelector
): string {
    // Pattern to match: object.method(index) or getFace(object, index)
    const patterns = [
        // getFace(shape, 0) -> selectFace(shape, { stableId: "..." })
        new RegExp(`getFace\\(\\s*${objectId}\\s*,\\s*${oldIndex}\\s*\\)`, 'g'),
        // shape.faces[0] -> selectFace(shape, { stableId: "..." })
        new RegExp(`${objectId}\\.faces\\[${oldIndex}\\]`, 'g'),
    ];

    const generator = new ReferenceCodeGenerator({ compact: true });
    const reference: TopologyReference = {
        type: entityType,
        baseObjectId: objectId,
        stableId,
        semanticSelector: semantic,
        indexHint: oldIndex,
    };
    const replacement = generator.generateReferenceCode(reference);

    let result = code;
    for (const pattern of patterns) {
        result = result.replace(pattern, replacement);
    }

    return result;
}

/**
 * Extract all index-based references from code
 */
export function extractIndexReferences(code: string): Array<{
    objectId: string;
    entityType: TopologyEntityType;
    index: number;
    codeRange: { start: number; end: number };
}> {
    const references: Array<{
        objectId: string;
        entityType: TopologyEntityType;
        index: number;
        codeRange: { start: number; end: number };
    }> = [];

    // Pattern: getFace(objectId, index)
    const getFacePattern = /getFace\(\s*(\w+)\s*,\s*(\d+)\s*\)/g;
    let match;

    while ((match = getFacePattern.exec(code)) !== null) {
        references.push({
            objectId: match[1],
            entityType: 'face',
            index: parseInt(match[2]),
            codeRange: {
                start: match.index,
                end: match.index + match[0].length,
            },
        });
    }

    // Pattern: objectId.faces[index]
    const facesArrayPattern = /(\w+)\.faces\[(\d+)\]/g;
    while ((match = facesArrayPattern.exec(code)) !== null) {
        references.push({
            objectId: match[1],
            entityType: 'face',
            index: parseInt(match[2]),
            codeRange: {
                start: match.index,
                end: match.index + match[0].length,
            },
        });
    }

    // Pattern: (e) => e.inDirection(...) - edge selector
    const edgeDirectionPattern = /\(e\)\s*=>\s*e\.inDirection\(\[([^\]]+)\]\)/g;
    while ((match = edgeDirectionPattern.exec(code)) !== null) {
        // This is already a geometric selector, not index-based
        // We can still track it for migration purposes
    }

    return references;
}

/**
 * Generate migration report for a code file
 */
export function generateMigrationReport(code: string): {
    totalReferences: number;
    indexBasedReferences: number;
    stableReferences: number;
    recommendations: string[];
} {
    const indexRefs = extractIndexReferences(code);
    const stableRefPattern = /selectFace\([^)]+stableId:/g;
    const stableMatches = code.match(stableRefPattern) || [];

    const recommendations: string[] = [];

    if (indexRefs.length > 0) {
        recommendations.push(
            `Found ${indexRefs.length} index-based reference(s) that should be migrated to stable IDs.`
        );

        // Group by object
        const byObject = new Map<string, number>();
        for (const ref of indexRefs) {
            byObject.set(ref.objectId, (byObject.get(ref.objectId) || 0) + 1);
        }

        for (const [objectId, count] of byObject) {
            recommendations.push(`  - ${objectId}: ${count} reference(s)`);
        }
    }

    if (stableMatches.length > 0) {
        recommendations.push(
            `Found ${stableMatches.length} stable reference(s) - good!`
        );
    }

    return {
        totalReferences: indexRefs.length + stableMatches.length,
        indexBasedReferences: indexRefs.length,
        stableReferences: stableMatches.length,
        recommendations,
    };
}

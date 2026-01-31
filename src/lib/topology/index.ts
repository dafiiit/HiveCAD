/**
 * Topology Reference Types
 * 
 * These types provide a bridge between display-time topology (face/edge/vertex indices
 * from mesh rendering) and code-time topology (references usable in generated code).
 */

/**
 * Reference to a topological element (face, edge, or vertex) of a solid
 */
export interface TopologyReference {
    /** Type of topological element */
    type: 'face' | 'edge' | 'vertex';

    /** The ID of the base solid/body object */
    baseObjectId: string;

    /** Display-time index (from faceMapping/edgeMapping) */
    index: number;

    /** Optional stable selector for future robustness */
    selector?: TopologySelector;
}

/**
 * A selector that can identify topology elements across regenerations
 * For now, we only support index-based selection.
 * Future: geometric selectors like "face parallel to XY" or "largest face"
 */
export interface TopologySelector {
    type: 'index' | 'parallel_to_plane' | 'normal_vector' | 'largest' | 'at_position';
    params: Record<string, any>;
}

/**
 * Parse a selection ID (e.g., "body1:face-0") into a TopologyReference
 */
export function parseSelectionId(selectionId: string): TopologyReference | null {
    const faceMatch = selectionId.match(/^(.+):face-(\d+)$/);
    if (faceMatch) {
        return {
            type: 'face',
            baseObjectId: faceMatch[1],
            index: parseInt(faceMatch[2], 10)
        };
    }

    const edgeMatch = selectionId.match(/^(.+):edge-(\d+)$/);
    if (edgeMatch) {
        return {
            type: 'edge',
            baseObjectId: edgeMatch[1],
            index: parseInt(edgeMatch[2], 10)
        };
    }

    const vertexMatch = selectionId.match(/^(.+):vertex-(\d+)$/);
    if (vertexMatch) {
        return {
            type: 'vertex',
            baseObjectId: vertexMatch[1],
            index: parseInt(vertexMatch[2], 10)
        };
    }

    return null;
}

/**
 * Create a selection ID from a TopologyReference
 */
export function toSelectionId(ref: TopologyReference): string {
    return `${ref.baseObjectId}:${ref.type}-${ref.index}`;
}

/**
 * Check if a selection ID refers to a face
 */
export function isFaceSelection(selectionId: string): boolean {
    return selectionId.includes(':face-');
}

/**
 * Check if a selection ID refers to an edge
 */
export function isEdgeSelection(selectionId: string): boolean {
    return selectionId.includes(':edge-');
}

/**
 * Check if a selection ID refers to a vertex
 */
export function isVertexSelection(selectionId: string): boolean {
    return selectionId.includes(':vertex-');
}

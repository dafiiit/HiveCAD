/**
 * SelectionManager - Centralized selection logic for the 3D viewport.
 * 
 * This module defines the selection policy for HiveCAD's viewport interactions:
 * 
 * - **Single click on a feature** (face, edge, vertex): Toggles its marked state.
 *   Multiple features can be marked simultaneously without holding Shift.
 * - **Double click on an object**: Selects the entire body (clears sub-feature marks
 *   for that body and marks the body itself).
 * - **Single click on background**: Clears all selections/marks.
 * - **Double click on background**: No effect.
 * 
 * The selection uses a unified Set<string> of selection IDs:
 * - Body: "objectId"
 * - Face: "objectId:face-N"
 * - Edge: "objectId:edge-N"
 * - Vertex: "objectId:vertex-N"
 * 
 * Tools can query the selection for specific types, e.g., a Mirror tool
 * can ask for all selected faces, or a Fillet tool for all selected edges.
 */

export type SelectionFeatureType = 'face' | 'edge' | 'vertex' | 'body';

export interface SelectionEntry {
    objectId: string;
    type: SelectionFeatureType;
    featureId: number | null; // null for body selection
    selectionId: string;
}

/**
 * Parse a selection ID string into its components.
 */
export function parseSelectionId(selectionId: string): SelectionEntry {
    if (selectionId.includes(':face-')) {
        const [objectId, rest] = selectionId.split(':face-');
        return { objectId, type: 'face', featureId: parseInt(rest, 10), selectionId };
    }
    if (selectionId.includes(':edge-')) {
        const [objectId, rest] = selectionId.split(':edge-');
        return { objectId, type: 'edge', featureId: parseInt(rest, 10), selectionId };
    }
    if (selectionId.includes(':vertex-')) {
        const [objectId, rest] = selectionId.split(':vertex-');
        return { objectId, type: 'vertex', featureId: parseInt(rest, 10), selectionId };
    }
    return { objectId: selectionId, type: 'body', featureId: null, selectionId };
}

/**
 * Build a selection ID from components.
 */
export function buildSelectionId(objectId: string, type: SelectionFeatureType, featureId: number | null): string {
    if (type === 'body' || featureId === null) return objectId;
    return `${objectId}:${type}-${featureId}`;
}

/**
 * Get all selections of a specific type from a selection set.
 */
export function getSelectionsByType(selectedIds: Set<string>, type: SelectionFeatureType): SelectionEntry[] {
    const result: SelectionEntry[] = [];
    selectedIds.forEach(id => {
        const entry = parseSelectionId(id);
        if (entry.type === type) {
            result.push(entry);
        }
    });
    return result;
}

/**
 * Get all selections belonging to a specific object.
 */
export function getSelectionsForObject(selectedIds: Set<string>, objectId: string): SelectionEntry[] {
    const result: SelectionEntry[] = [];
    selectedIds.forEach(id => {
        const entry = parseSelectionId(id);
        if (entry.objectId === objectId) {
            result.push(entry);
        }
    });
    return result;
}

/**
 * Compute the new selection set after a single click on a feature.
 * Single click always toggles the clicked feature (additive selection).
 */
export function computeClickSelection(
    currentSelection: Set<string>,
    clickedSelectionId: string
): Set<string> {
    const newSelection = new Set(currentSelection);

    if (newSelection.has(clickedSelectionId)) {
        // Toggle off
        newSelection.delete(clickedSelectionId);
    } else {
        // Toggle on
        newSelection.add(clickedSelectionId);
    }

    return newSelection;
}

/**
 * Compute the new selection set after a double-click on a body.
 * Double-click selects the entire body: removes any sub-feature selections
 * for that body and toggles the body-level selection.
 */
export function computeDoubleClickSelection(
    currentSelection: Set<string>,
    objectId: string
): Set<string> {
    const newSelection = new Set<string>();

    // Keep selections from OTHER objects
    currentSelection.forEach(id => {
        const entry = parseSelectionId(id);
        if (entry.objectId !== objectId) {
            newSelection.add(id);
        }
    });

    // Toggle body selection: if body was already selected (and it was the only selection
    // for this object), remove it. Otherwise, select the body.
    const wasBodySelected = currentSelection.has(objectId);
    const objectSelections = getSelectionsForObject(currentSelection, objectId);
    const wasOnlyBodySelected = wasBodySelected && objectSelections.length === 1;

    if (!wasOnlyBodySelected) {
        // Either there were sub-feature selections, or nothing was selected for this body.
        // Select the body.
        newSelection.add(objectId);
    }
    // If wasOnlyBodySelected, we don't add it back (toggle off)

    return newSelection;
}

/**
 * Extract face IDs from a selection set for a specific object.
 */
export function getSelectedFaceIds(selectedIds: Set<string>, objectId: string): number[] {
    const faces: number[] = [];
    selectedIds.forEach(id => {
        if (id.startsWith(objectId + ':face-')) {
            const faceId = parseInt(id.split(':face-')[1], 10);
            if (!isNaN(faceId)) faces.push(faceId);
        }
    });
    return faces;
}

/**
 * Extract edge IDs from a selection set for a specific object.
 */
export function getSelectedEdgeIds(selectedIds: Set<string>, objectId: string): number[] {
    const edges: number[] = [];
    selectedIds.forEach(id => {
        if (id.startsWith(objectId + ':edge-')) {
            const edgeId = parseInt(id.split(':edge-')[1], 10);
            if (!isNaN(edgeId)) edges.push(edgeId);
        }
    });
    return edges;
}

/**
 * Extract vertex IDs from a selection set for a specific object.
 */
export function getSelectedVertexIds(selectedIds: Set<string>, objectId: string): number[] {
    const verts: number[] = [];
    selectedIds.forEach(id => {
        if (id.startsWith(objectId + ':vertex-')) {
            const vid = parseInt(id.split(':vertex-')[1], 10);
            if (!isNaN(vid)) verts.push(vid);
        }
    });
    return verts;
}

/**
 * Check if a body-level selection exists for a given object.
 */
export function isBodySelected(selectedIds: Set<string>, objectId: string): boolean {
    return selectedIds.has(objectId);
}

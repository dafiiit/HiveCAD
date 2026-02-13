import type { Tool, ToolContext } from '../../../types';

/**
 * Trim Tool
 *
 * Removes the selected sketch primitive (line, arc, or segment of a shape).
 * Works by deleting the selected primitive from the active sketch primitives.
 *
 * Workflow:
 * 1. User activates Trim tool.
 * 2. User clicks on a sketch entity (line, arc, shape edge).
 * 3. The clicked primitive is removed from activeSketchPrimitives.
 *
 * For compound shapes (rectangle → 4 lines), the shape is first decomposed
 * into individual segments, then only the clicked segment is removed.
 *
 * The actual click handling is in SketchCanvas; the tool only declares
 * metadata and the execute method for batch operations on selection.
 */
export const trimTool: Tool = {
    metadata: {
        id: 'trim',
        label: 'Trim',
        icon: 'Scissors',
        category: 'modify',
        group: 'Modify',
        description: 'Remove selected sketch entities (lines, arcs, segments)',
        shortcut: 'T',
    },
    uiProperties: [],

    /**
     * Execute trim on the current selection.
     * Removes all selected primitives from the sketch.
     */
    execute(context: ToolContext): void {
        // Trim is handled directly in SketchCanvas via selectedPrimitiveIds
        // This execute is for programmatic API access (e.g., tests, agents)
    },
};

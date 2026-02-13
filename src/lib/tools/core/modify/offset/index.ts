import type { Tool, ToolContext } from '../../../types';

/**
 * Offset Tool
 *
 * Moves the selected sketch element(s) by a precise offset in both possible
 * axis directions. Works on the active sketch's selected primitives.
 *
 * Workflow:
 * 1. User selects one or more sketch primitives.
 * 2. User activates Offset tool.
 * 3. UI shows offset X/Y input fields.
 * 4. User enters values and confirms — primitives are translated.
 *
 * Unlike CAD "offset" (which creates a parallel copy at distance), this tool
 * translates the selected entities precisely. For parallel duplication, use
 * Mirror or Duplicate + Offset.
 */
export const offsetTool: Tool = {
    metadata: {
        id: 'offset',
        label: 'Offset',
        icon: 'CopyPlus',
        category: 'modify',
        group: 'Modify',
        description: 'Move selected sketch elements by a precise offset in X/Y',
        shortcut: 'O',
    },
    uiProperties: [
        {
            key: 'offsetX',
            label: 'Offset X',
            type: 'number',
            default: 0,
            unit: 'mm',
            step: 0.5,
        },
        {
            key: 'offsetY',
            label: 'Offset Y',
            type: 'number',
            default: 0,
            unit: 'mm',
            step: 0.5,
        },
    ],

    /**
     * Execute offset on the current sketch selection.
     * Reads offsetX/offsetY from params and translates all points
     * of selected primitives.
     */
    execute(context: ToolContext): void {
        // Offset is dispatched by the SketchCanvas / OperationProperties panel.
        // The panel reads offsetX, offsetY from params and calls
        // updatePrimitivePoint for each selected primitive.
    },
};

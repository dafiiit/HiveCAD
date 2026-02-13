import type { Tool, ToolContext } from '../../../types';

/**
 * Toggle Construction Tool
 *
 * Toggles selected sketch entities between normal and construction mode.
 *
 * Construction entities:
 * - Are rendered with dashed orange lines.
 * - Are excluded from profile detection (code generation skips them).
 * - Cannot be extruded into 3D objects.
 * - Serve as reference geometry (guidelines, symmetry axes, layout helpers).
 *
 * Workflow:
 * 1. User selects one or more sketch primitives.
 * 2. User presses X or clicks the Construction button.
 * 3. `properties.construction` is toggled on each selected primitive.
 * 4. The rendering pipeline reads the construction flag and applies
 *    dashed lines + orange color.
 * 5. On finishSketch(), construction entities are marked `construction: true`
 *    in the SketchEntity and filtered out before code generation.
 *
 * Works on any entity type: lines, arcs, circles, rectangles, polygons, splines.
 */
export const toggleConstructionTool: Tool = {
    metadata: {
        id: 'toggleConstruction',
        label: 'Construction',
        icon: 'Construction',
        category: 'modify',
        group: 'Modify',
        description: 'Toggle selected sketch entities to/from construction geometry (dashed, non-extrudable)',
        shortcut: 'X',
    },
    uiProperties: [],

    /**
     * Execute construction toggle.
     * Handled directly via sketchSlice.togglePrimitiveConstruction().
     */
    execute(context: ToolContext): void {
        // Dispatched by SketchCanvas — iterates selectedPrimitiveIds
        // and calls togglePrimitiveConstruction(id) for each.
    },
};

import type { Tool, ToolContext } from '../../../types';

/**
 * Dimension Tool
 *
 * Professional parametric dimensioning inspired by Fusion 360 and Onshape.
 *
 * Supported dimension types:
 * - **Line length**: Click a line → drives its length via a distance constraint.
 * - **Point-to-point distance**: Click two endpoints → distance constraint.
 * - **Circle/Arc radius**: Click a circle/arc → radius constraint.
 * - **Angle between lines**: Click two non-parallel lines → angle constraint.
 *
 * Workflow:
 * 1. User activates Dimension tool (shortcut: D).
 * 2. User clicks entity/entities:
 *    a. Single line → length dimension
 *    b. Single circle/arc → radius dimension
 *    c. Two points → distance dimension
 *    d. Two lines → angle dimension
 * 3. A dimension input popup appears at the click location.
 * 4. User enters the desired value and presses Enter.
 * 5. The solver is invoked with the new driving constraint.
 * 6. Geometry updates to satisfy the dimension.
 *
 * Dimensions are displayed as annotation badges on the sketch canvas.
 * They are driving constraints — editing the value re-solves the sketch.
 *
 * Dimension annotations render:
 * - Extension lines from the entity to the dimension line
 * - The dimension line (with arrows/ticks)
 * - The value label (editable on double-click)
 */

export type DimensionMode = 'auto' | 'distance' | 'angle' | 'radius';

/**
 * Infer the appropriate dimension mode from selection.
 */
export function inferDimensionMode(
    entityTypes: string[],
    count: number,
): DimensionMode {
    if (count === 1) {
        if (entityTypes[0] === 'line') return 'distance';
        if (entityTypes[0] === 'circle' || entityTypes[0] === 'arc') return 'radius';
    }
    if (count === 2) {
        if (entityTypes.every(t => t === 'point')) return 'distance';
        if (entityTypes.every(t => t === 'line')) return 'angle';
    }
    return 'auto';
}

/**
 * Compute the distance between two 2D points.
 */
export function computeDistance(
    p1: [number, number],
    p2: [number, number],
): number {
    return Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
}

/**
 * Compute the angle between two line directions (0..π).
 */
export function computeAngleBetweenLines(
    l1p1: [number, number], l1p2: [number, number],
    l2p1: [number, number], l2p2: [number, number],
): number {
    const d1x = l1p2[0] - l1p1[0];
    const d1y = l1p2[1] - l1p1[1];
    const d2x = l2p2[0] - l2p1[0];
    const d2y = l2p2[1] - l2p1[1];
    const dot = d1x * d2x + d1y * d2y;
    const mag1 = Math.hypot(d1x, d1y);
    const mag2 = Math.hypot(d2x, d2y);
    if (mag1 < 1e-10 || mag2 < 1e-10) return 0;
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cosAngle);
}

export const dimensionTool: Tool = {
    metadata: {
        id: 'dimension',
        label: 'Dimension',
        icon: 'Ruler',
        category: 'modify',
        group: 'Modify',
        description: 'Add dimensional constraints: distances, radii, and angles',
        shortcut: 'D',
    },
    uiProperties: [
        {
            key: 'dimensionValue',
            label: 'Value',
            type: 'number',
            default: 0,
            unit: 'mm',
            step: 0.1,
            min: 0,
        },
        {
            key: 'dimensionMode',
            label: 'Mode',
            type: 'select',
            default: 'auto',
            options: [
                { value: 'auto', label: 'Auto-detect' },
                { value: 'distance', label: 'Distance' },
                { value: 'angle', label: 'Angle' },
                { value: 'radius', label: 'Radius' },
            ],
        },
    ],

    /**
     * Execute dimension.
     * The dimension workflow is driven by the SketchCanvas + OperationProperties
     * panel. On confirmation, the appropriate solver constraint is created.
     */
    execute(context: ToolContext): void {
        // Dimension creation is handled in SketchCanvas.
        // Steps:
        // 1. Determine dimension type from selection (inferDimensionMode)
        // 2. Compute current value (computeDistance / computeAngleBetweenLines)
        // 3. Show input field pre-filled with current value
        // 4. On confirm: addSolverConstraint('distance' | 'angle' | 'radius', entityIds, value)
    },
};

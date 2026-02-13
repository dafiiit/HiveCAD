import type { Tool, ToolContext } from '../../../types';

/**
 * Mirror Tool
 *
 * Creates a mirrored copy of selected sketch entities across a mirror axis.
 *
 * Workflow:
 * 1. User selects sketch entities to mirror.
 * 2. User activates Mirror tool.
 * 3. User selects the mirror axis (any existing line in the sketch).
 * 4. Mirrored copies are created with a Symmetric constraint linking each
 *    original endpoint to its mirrored counterpart via the axis line.
 *
 * The symmetric constraint keeps the mirror relationship live — moving the
 * original automatically updates its mirror, and vice versa.
 *
 * Implementation:
 * - For each selected primitive, compute the reflection of every point
 *   across the mirror line.
 * - Create new primitives from the reflected points (same type, flipped properties).
 * - For each pair (original point, reflected point), add a 'symmetric' constraint
 *   referencing the mirror axis line's solver entity.
 */

/**
 * Reflect a 2D point across a line defined by two points.
 */
export function reflectPoint(
    point: [number, number],
    lineP1: [number, number],
    lineP2: [number, number],
): [number, number] {
    const [px, py] = point;
    const [x1, y1] = lineP1;
    const [x2, y2] = lineP2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) return point; // Degenerate line

    // Project p onto the line: t = dot(p - p1, d) / |d|²
    const t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    // Foot of perpendicular
    const fx = x1 + t * dx;
    const fy = y1 + t * dy;
    // Reflect: p' = 2*foot - p
    return [2 * fx - px, 2 * fy - py];
}

/**
 * Reflect all points of a primitive across a mirror line.
 */
export function reflectPrimitive(
    points: [number, number][],
    lineP1: [number, number],
    lineP2: [number, number],
): [number, number][] {
    return points.map(p => reflectPoint(p, lineP1, lineP2));
}

export const mirrorTool: Tool = {
    metadata: {
        id: 'mirror',
        label: 'Mirror',
        icon: 'FlipHorizontal2',
        category: 'modify',
        group: 'Modify',
        description: 'Mirror sketch entities across a line with symmetric constraints',
        shortcut: 'M',
    },
    uiProperties: [],

    /**
     * Execute mirror.
     * Mirror is handled by SketchCanvas: after the user picks a mirror axis,
     * reflected primitives are created and symmetric constraints applied.
     */
    execute(context: ToolContext): void {
        // Implementation in SketchCanvas — mirror axis selection workflow
    },
};

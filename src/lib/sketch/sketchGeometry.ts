/**
 * Pure geometry utilities for the sketch system.
 * These functions have no side effects and no store dependencies —
 * they can be imported and unit-tested in isolation.
 */

/** Threshold (sketch units) below which two endpoints are considered coincident. */
export const COINCIDENT_THRESHOLD = 0.05;

/** Distance between two 2D points. */
export function dist2D(a: [number, number], b: [number, number]): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/** Clamp a value to [0, 1]. */
export function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/** Test whether two 2D points are identical within an epsilon tolerance. */
export function isSamePoint(a: [number, number], b: [number, number], epsilon = 1e-9): boolean {
    return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

/**
 * Project a point onto a line segment, returning the closest point on the segment
 * and the normalised parameter `t ∈ [0, 1]` along the segment.
 */
export function projectPointToLineSegment(
    point: [number, number],
    start: [number, number],
    end: [number, number],
): { point: [number, number]; t: number } {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lenSq = dx * dx + dy * dy;

    if (lenSq <= 1e-12) {
        return { point: start, t: 0 };
    }

    const t = clamp01(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lenSq);
    return {
        point: [start[0] + dx * t, start[1] + dy * t],
        t,
    };
}

/**
 * Return the point indices that are considered "connectable endpoints" for a
 * given primitive type.  Coincident constraints can only be auto-detected and
 * propagated at these indices.
 */
export function getEndpointIndices(primitive: { type: string; points: [number, number][] }): number[] {
    switch (primitive.type) {
        case 'line':
        case 'constructionLine':
        case 'vline':
        case 'hline':
        case 'polarline':
        case 'tangentline':
            return primitive.points.length >= 2 ? [0, primitive.points.length - 1] : [];
        case 'threePointsArc':
            // Points: [start, end, via] — only start and end are "connectable"
            return primitive.points.length >= 2 ? [0, 1] : [];
        case 'centerPointArc':
            // Points: [center, start, end] — only start and end are "connectable"
            return primitive.points.length >= 3 ? [1, 2] : [];
        default:
            return [];
    }
}

/** Returns true if the primitive is a line-like entity with at least 2 points. */
export function isLineLikePrimitive(
    primitive: { type: string; points: [number, number][] } | undefined,
): boolean {
    if (!primitive) return false;
    return ['line', 'constructionLine', 'vline', 'hline', 'polarline', 'tangentline'].includes(primitive.type)
        && primitive.points.length >= 2;
}

/**
 * Convert a legacy SketchPrimitive to the new SketchEntity format.
 * Handles control-point derivation for Bezier/spline types.
 */
export function primitiveToEntity(prim: any): import('../sketch').SketchEntity {
    const props = prim.properties ?? {};

    let controlPoints = props.controlPoints as Array<[number, number]> | undefined;

    if (!controlPoints) {
        const start = prim.points?.[0] as [number, number] | undefined;
        const end   = prim.points?.[1] as [number, number] | undefined;

        if (prim.type === 'quadraticBezier' && start && end) {
            const cx = props.ctrlX ?? 0;
            const cy = props.ctrlY ?? 0;
            controlPoints = [[start[0] + cx, start[1] + cy]];
        } else if (prim.type === 'bezier' && prim.points?.[2]) {
            controlPoints = [prim.points[2] as [number, number]];
        } else if (prim.type === 'cubicBezier' && start && end) {
            const cs: [number, number] = [
                start[0] + (props.ctrlStartX ?? 0),
                start[1] + (props.ctrlStartY ?? 0),
            ];
            const ce: [number, number] = [
                end[0] + (props.ctrlEndX ?? 0),
                end[1] + (props.ctrlEndY ?? 0),
            ];
            controlPoints = [cs, ce];
        }
    }

    const isConstruction = prim.type === 'constructionLine' || prim.type === 'constructionCircle'
        || props.construction === true;

    return {
        id: prim.id,
        type: prim.type === 'threePointsArc' ? 'arc' : prim.type,
        points: prim.points,
        construction: isConstruction,
        properties: {
            sides: props.sides,
            sagitta: props.sagitta,
            radius: props.radius,
            cornerRadius: props.radius,
            text: props.text,
            fontSize: props.fontSize,
            fontFamily: props.fontFamily,
            startTangent: props.startTangent,
            endTangent: props.endTangent,
            startFactor: props.startFactor,
            endFactor: props.endFactor,
            controlPoints,
            solverId: props.solverId,
        }
    };
}

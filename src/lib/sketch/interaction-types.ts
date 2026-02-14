/**
 * Sketch Interaction Types
 * 
 * Generalized types for sketch entity selection, handles, hover states,
 * and construction mode. These types power the interactive editing of
 * sketch primitives across all tool types.
 * 
 * Design principle: any sketch tool can declare handle points and
 * the interaction system handles dragging, selection highlighting,
 * and construction toggling uniformly.
 */

// ──────────────────────────────────────────────────────────────
// Handle System
// ──────────────────────────────────────────────────────────────

/**
 * A draggable control/handle point on a sketch primitive.
 * Tools declare which of their points are handles, and what kind.
 */
export type HandlePointType =
    | 'endpoint'       // Start/end of a line, arc endpoint
    | 'control'        // Bezier control point, arc via/center
    | 'midpoint'       // Midpoint handle for moving entire entity
    | 'center';        // Center of circle, arc, etc.

export interface HandlePoint {
    /** Unique handle ID (e.g., "prim-id:start", "prim-id:end") */
    id: string;
    /** Index into the primitive's points array */
    pointIndex: number;
    /** What kind of handle this is */
    type: HandlePointType;
    /** Position in 2D sketch space */
    position: [number, number];
    /** Optional label for the handle (e.g., "Start", "End", "Center") */
    label?: string;
}

/**
 * Compute the center of a circular arc from 3 points.
 * Returns null if the points are collinear.
 */
function computeArcCenter(
    p1: [number, number],
    p2: [number, number],
    p3: [number, number],
): [number, number] | null {
    const ax = p1[0], ay = p1[1];
    const bx = p2[0], by = p2[1];
    const cx = p3[0], cy = p3[1];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-10) return null; // Collinear
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return [ux, uy];
}

/**
 * Extract handle points from a sketch primitive.
 * This is the generalized function all tools use — it reads the primitive
 * type and points array to produce draggable handles.
 */
export function getHandlePoints(primitive: {
    id: string;
    type: string;
    points: [number, number][];
}): HandlePoint[] {
    const handles: HandlePoint[] = [];
    const pts = primitive.points;

    switch (primitive.type) {
        case 'line':
        case 'constructionLine':
        case 'vline':
        case 'hline':
        case 'polarline':
        case 'tangentline':
            if (pts.length >= 2) {
                handles.push({
                    id: `${primitive.id}:0`,
                    pointIndex: 0,
                    type: 'endpoint',
                    position: pts[0],
                    label: 'Start',
                });
                handles.push({
                    id: `${primitive.id}:1`,
                    pointIndex: pts.length - 1,
                    type: 'endpoint',
                    position: pts[pts.length - 1],
                    label: 'End',
                });
            }
            break;

        case 'threePointsArc':
            // Points: [start, end, via/mid]
            if (pts.length >= 2) {
                handles.push({
                    id: `${primitive.id}:0`,
                    pointIndex: 0,
                    type: 'endpoint',
                    position: pts[0],
                    label: 'Start',
                });
                handles.push({
                    id: `${primitive.id}:1`,
                    pointIndex: 1,
                    type: 'endpoint',
                    position: pts[1],
                    label: 'End',
                });
            }
            if (pts.length >= 3) {
                handles.push({
                    id: `${primitive.id}:2`,
                    pointIndex: 2,
                    type: 'control',
                    position: pts[2],
                    label: 'Mid',
                });
                // Computed center handle — dragging translates all 3 points
                const center = computeArcCenter(pts[0], pts[1], pts[2]);
                if (center) {
                    handles.push({
                        id: `${primitive.id}:center`,
                        pointIndex: -1, // Special: means "translate all points"
                        type: 'center',
                        position: center,
                        label: 'Center',
                    });
                }
            }
            break;

        case 'centerPointArc':
            // Points: [center, start, end]
            if (pts.length >= 1) {
                handles.push({
                    id: `${primitive.id}:0`,
                    pointIndex: 0,
                    type: 'center',
                    position: pts[0],
                    label: 'Center',
                });
            }
            if (pts.length >= 2) {
                handles.push({
                    id: `${primitive.id}:1`,
                    pointIndex: 1,
                    type: 'endpoint',
                    position: pts[1],
                    label: 'Start',
                });
            }
            if (pts.length >= 3) {
                handles.push({
                    id: `${primitive.id}:2`,
                    pointIndex: 2,
                    type: 'endpoint',
                    position: pts[2],
                    label: 'End',
                });
            }
            break;

        case 'circle':
        case 'constructionCircle':
            // Points: [center, edgePoint]
            if (pts.length >= 1) {
                handles.push({
                    id: `${primitive.id}:0`,
                    pointIndex: 0,
                    type: 'center',
                    position: pts[0],
                    label: 'Center',
                });
            }
            if (pts.length >= 2) {
                handles.push({
                    id: `${primitive.id}:1`,
                    pointIndex: 1,
                    type: 'endpoint',
                    position: pts[1],
                    label: 'Radius',
                });
            }
            break;

        case 'rectangle':
        case 'roundedRectangle':
            // Points: [corner1, corner2]
            if (pts.length >= 2) {
                handles.push({
                    id: `${primitive.id}:0`,
                    pointIndex: 0,
                    type: 'endpoint',
                    position: pts[0],
                    label: 'Corner 1',
                });
                handles.push({
                    id: `${primitive.id}:1`,
                    pointIndex: 1,
                    type: 'endpoint',
                    position: pts[1],
                    label: 'Corner 2',
                });
            }
            break;

        case 'ellipse':
            // Points: [center, edge]
            if (pts.length >= 1) {
                handles.push({
                    id: `${primitive.id}:0`,
                    pointIndex: 0,
                    type: 'center',
                    position: pts[0],
                    label: 'Center',
                });
            }
            if (pts.length >= 2) {
                handles.push({
                    id: `${primitive.id}:1`,
                    pointIndex: 1,
                    type: 'endpoint',
                    position: pts[1],
                    label: 'Edge',
                });
            }
            break;

        case 'smoothSpline':
        case 'spline':
            // All points are control handles
            for (let i = 0; i < pts.length; i++) {
                handles.push({
                    id: `${primitive.id}:${i}`,
                    pointIndex: i,
                    type: i === 0 || i === pts.length - 1 ? 'endpoint' : 'control',
                    position: pts[i],
                    label: i === 0 ? 'Start' : i === pts.length - 1 ? 'End' : `P${i}`,
                });
            }
            break;

        case 'bezier':
        case 'quadraticBezier':
        case 'cubicBezier':
            for (let i = 0; i < pts.length; i++) {
                handles.push({
                    id: `${primitive.id}:${i}`,
                    pointIndex: i,
                    type: i === 0 || i === 1 ? 'endpoint' : 'control',
                    position: pts[i],
                    label: i === 0 ? 'Start' : i === 1 ? 'End' : `Ctrl${i - 1}`,
                });
            }
            break;

        case 'polygon':
            // Corner1 and corner2 (inscribed polygon)
            if (pts.length >= 2) {
                handles.push({
                    id: `${primitive.id}:0`,
                    pointIndex: 0,
                    type: 'center',
                    position: pts[0],
                    label: 'Center',
                });
                handles.push({
                    id: `${primitive.id}:1`,
                    pointIndex: 1,
                    type: 'endpoint',
                    position: pts[1],
                    label: 'Vertex',
                });
            }
            break;

        default:
            // Fallback: treat all points as endpoints
            for (let i = 0; i < pts.length; i++) {
                handles.push({
                    id: `${primitive.id}:${i}`,
                    pointIndex: i,
                    type: 'endpoint',
                    position: pts[i],
                });
            }
            break;
    }

    return handles;
}

// ──────────────────────────────────────────────────────────────
// Selection & Hover States
// ──────────────────────────────────────────────────────────────

/**
 * Visual state of a sketch entity, used for rendering color/style decisions.
 */
export type SketchEntityState =
    | 'default'          // Normal state — white/light
    | 'hovered'          // Mouse hovering over entity — highlight blue
    | 'selected'         // Entity is selected — selection blue
    | 'constrained'      // Fully constrained — green
    | 'construction'     // Construction geometry — dashed orange
    | 'drawing';         // Currently being drawn — cyan/yellow

/**
 * Get the rendering color for a sketch entity based on its visual state.
 */
export function getEntityColor(state: SketchEntityState): string {
    switch (state) {
        case 'default':       return '#FFFFFF';      // White
        case 'hovered':       return '#66B2FF';      // Light blue
        case 'selected':      return '#3399FF';      // Selection blue
        case 'constrained':   return '#00CC66';      // Green
        case 'construction':  return '#FF9933';      // Orange
        case 'drawing':       return '#FFFF00';      // Yellow (ghost)
        default:              return '#FFFFFF';
    }
}

/**
 * Get the line dash pattern for a sketch entity state.
 * Returns [dashSize, gapSize] or null for solid lines.
 */
export function getEntityDash(state: SketchEntityState, isConstruction: boolean): [number, number] | null {
    if (isConstruction) return [0.8, 0.4]; // Construction lines are always dashed
    return null; // Solid by default
}

/**
 * Get the line width for a sketch entity based on its visual state.
 */

//for testing if this is used I will increase the line width for hovered and selected states to make it more visually obvious.
export function getEntityLineWidth(state: SketchEntityState): number {
    switch (state) {
        case 'hovered':   return 10; 
        case 'selected':  return 10;
        case 'drawing':   return 8;
        default:          return 6;
    }
}


// ──────────────────────────────────────────────────────────────
// Handle Rendering Config
// ──────────────────────────────────────────────────────────────

/**
 * Get the visual size of a handle point based on its type.
 */
export function getHandleSize(type: HandlePointType): number {
    switch (type) {
        case 'endpoint':  return 2.0;
        case 'control':   return 1.7;
        case 'center':    return 1.7;
        case 'midpoint':  return 1.4;
        default:          return 1.7;
    }
}

/**
 * Get the color of a handle point based on its type, drag state, hover state, and selection state.
 */
export function getHandleColor(type: HandlePointType, isDragging: boolean, isHovered: boolean, isSelected: boolean = false): string {
    if (isDragging) return '#FFFF00';  // Yellow while dragging
    if (isSelected) return '#3399FF';  // Selection blue when parent primitive is selected
    if (isHovered)  return '#66B2FF';  // Light blue on hover
    switch (type) {
        case 'endpoint':  return '#FFFFFF';  // White
        case 'control':   return '#FFFFFF';  // White (consistent with endpoints)
        case 'center':    return '#FFFFFF';  // White (consistent with endpoints)
        case 'midpoint':  return '#AAAAAA';  // Gray for midpoints
        default:          return '#FFFFFF';
    }
}

// ──────────────────────────────────────────────────────────────
// Construction Mode
// ──────────────────────────────────────────────────────────────

/**
 * Check whether a primitive is a construction entity.
 */
export function isConstructionPrimitive(primitive: { type: string; properties?: Record<string, any> }): boolean {
    // Legacy types
    if (primitive.type === 'constructionLine' || primitive.type === 'constructionCircle') {
        return true;
    }
    // New universal construction flag
    return primitive.properties?.construction === true;
}

/**
 * Toggle construction mode on a primitive.
 * Returns a new primitive with the construction flag toggled.
 */
export function toggleConstruction<T extends { type: string; properties?: Record<string, any> }>(
    primitive: T
): T {
    const isConst = isConstructionPrimitive(primitive);
    return {
        ...primitive,
        properties: {
            ...primitive.properties,
            construction: !isConst,
        },
    };
}

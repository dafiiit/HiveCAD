/**
 * Sketch Rendering Utilities
 * 
 * Converts SketchEntity data into Three.js geometry/points for rendering.
 * Used both during active drawing (preview) and for displaying finished sketches.
 * 
 * All rendering is purely geometric — returns point arrays and geometries,
 * NOT React components (those are in SketchCanvas).
 */

import * as THREE from 'three';
import type { SketchEntity, Point2D, SketchPlane } from './types';

// ──────────────────────────────────────────────────────────────
// Coordinate Conversion
// ──────────────────────────────────────────────────────────────

/**
 * Create a to3D converter for a given sketch plane.
 * Maps 2D sketch (u, v) coordinates to 3D world coordinates.
 * Uses Z-up convention (Replicad/OpenCascade).
 */
export function createTo3D(plane: SketchPlane): (u: number, v: number) => THREE.Vector3 {
    switch (plane) {
        case 'XY': return (u, v) => new THREE.Vector3(u, v, 0);
        case 'XZ': return (u, v) => new THREE.Vector3(u, 0, v);
        case 'YZ': return (u, v) => new THREE.Vector3(0, u, v);
    }
}

/**
 * Create a to2D converter for a given sketch plane.
 * Maps 3D world coordinates to 2D sketch (u, v) coordinates.
 */
export function createTo2D(plane: SketchPlane): (v: THREE.Vector3) => Point2D {
    switch (plane) {
        case 'XY': return (v) => [v.x, v.y];
        case 'XZ': return (v) => [v.x, v.z];
        case 'YZ': return (v) => [v.y, v.z];
    }
}

// ──────────────────────────────────────────────────────────────
// Entity → Points Conversion
// ──────────────────────────────────────────────────────────────

/**
 * Get the display points for an entity (used for rendering).
 * Returns an array of 2D points that trace the entity shape.
 * For lines, this is just the endpoints; for curves, it's tessellated.
 */
export function getEntityDisplayPoints(entity: SketchEntity): Point2D[] {
    switch (entity.type) {
        case 'line':
        case 'constructionLine':
            return entity.points;

        case 'arc':
        case 'centerPointArc':
            return getArcDisplayPoints(entity);

        case 'circle':
        case 'constructionCircle':
            return getCircleDisplayPoints(entity);

        case 'ellipse':
            return getEllipseDisplayPoints(entity);

        case 'rectangle':
            return getRectangleDisplayPoints(entity);

        case 'roundedRectangle':
            return getRoundedRectangleDisplayPoints(entity);

        case 'polygon':
            return getPolygonDisplayPoints(entity);

        case 'smoothSpline':
            return getSplineDisplayPoints(entity);

        case 'bezier':
            return getBezierDisplayPoints(entity);

        case 'quadraticBezier':
            return getQuadBezierDisplayPoints(entity);

        case 'cubicBezier':
            return getCubicBezierDisplayPoints(entity);

        case 'text':
            return entity.points; // Point marker only

        default:
            return entity.points;
    }
}

// ──────────────────────────────────────────────────────────────
// Specific Entity Tessellation
// ──────────────────────────────────────────────────────────────

function getArcDisplayPoints(entity: SketchEntity, segments = 64): Point2D[] {
    if (entity.points.length < 3) {
        // If only start + end, return chord
        return entity.points;
    }

    const [start, end, via] = entity.points;
    const arc = computeArcFromThreePoints(start, end, via);
    if (!arc) return entity.points;

    const { cx, cy, radius, startAngle, endAngle, ccw } = arc;

    let sweep = endAngle - startAngle;
    if (ccw) {
        if (sweep <= 0) sweep += 2 * Math.PI;
    } else {
        if (sweep >= 0) sweep -= 2 * Math.PI;
    }

    const points: Point2D[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + sweep * t;
        points.push([
            cx + radius * Math.cos(angle),
            cy + radius * Math.sin(angle),
        ]);
    }
    return points;
}

function getCircleDisplayPoints(entity: SketchEntity, segments = 64): Point2D[] {
    if (entity.points.length < 2) return [];

    const [center, edge] = entity.points;
    const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);

    if (radius < 1e-6) return [center];

    const points: Point2D[] = [];
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push([
            center[0] + Math.cos(theta) * radius,
            center[1] + Math.sin(theta) * radius,
        ]);
    }
    return points;
}

function getEllipseDisplayPoints(entity: SketchEntity, segments = 64): Point2D[] {
    if (entity.points.length < 2) return [];

    const [center, edge] = entity.points;
    const rx = Math.abs(edge[0] - center[0]);
    const ry = Math.abs(edge[1] - center[1]);

    const points: Point2D[] = [];
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push([
            center[0] + Math.cos(theta) * rx,
            center[1] + Math.sin(theta) * ry,
        ]);
    }
    return points;
}

function getRectangleDisplayPoints(entity: SketchEntity): Point2D[] {
    if (entity.points.length < 2) return [];
    const [p1, p2] = entity.points;
    return [
        p1,
        [p2[0], p1[1]],
        p2,
        [p1[0], p2[1]],
        p1, // close the loop
    ];
}

function getRoundedRectangleDisplayPoints(entity: SketchEntity, arcSegments = 8): Point2D[] {
    if (entity.points.length < 2) return getRectangleDisplayPoints(entity);

    const [p1, p2] = entity.points;
    const minX = Math.min(p1[0], p2[0]);
    const maxX = Math.max(p1[0], p2[0]);
    const minY = Math.min(p1[1], p2[1]);
    const maxY = Math.max(p1[1], p2[1]);

    const w = maxX - minX;
    const h = maxY - minY;
    const r = Math.min(entity.properties.cornerRadius ?? 3, w / 2, h / 2);

    if (r < 1e-6) return getRectangleDisplayPoints(entity);

    const points: Point2D[] = [];

    // Top-right corner
    for (let i = 0; i <= arcSegments; i++) {
        const a = -Math.PI / 2 + (Math.PI / 2) * (i / arcSegments);
        points.push([maxX - r + r * Math.cos(a), maxY - r + r * Math.sin(a)]);
    }
    // Top-left corner
    for (let i = 0; i <= arcSegments; i++) {
        const a = 0 + (Math.PI / 2) * (i / arcSegments);
        points.push([minX + r - r * Math.cos(Math.PI / 2 - a), maxY - r + r * Math.sin(Math.PI / 2 - a)]);
    }
    // Wait, let me do this systematically
    // Actually let me redo this properly:

    points.length = 0;

    // Bottom-right corner arc (from 3 o'clock going clockwise to 6 o'clock)
    // We go counter-clockwise around the rectangle
    // Start at bottom-right, horizontal edge
    // Right edge, bottom to top
    addCornerArc(points, maxX - r, minY + r, r, -Math.PI / 2, 0, arcSegments);
    // Top edge, right to left
    addCornerArc(points, maxX - r, maxY - r, r, 0, Math.PI / 2, arcSegments);
    // Left edge, top to bottom
    addCornerArc(points, minX + r, maxY - r, r, Math.PI / 2, Math.PI, arcSegments);
    // Bottom edge, left to right
    addCornerArc(points, minX + r, minY + r, r, Math.PI, 3 * Math.PI / 2, arcSegments);

    // Close
    if (points.length > 0) {
        points.push(points[0]);
    }

    return points;
}

function addCornerArc(
    out: Point2D[],
    cx: number, cy: number,
    r: number,
    startAngle: number, endAngle: number,
    segments: number,
): void {
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = startAngle + (endAngle - startAngle) * t;
        out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
}

function getPolygonDisplayPoints(entity: SketchEntity): Point2D[] {
    if (entity.points.length < 2) return [];

    const [center, edge] = entity.points;
    const sides = entity.properties.sides ?? 6;
    const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
    const startAngle = Math.atan2(edge[1] - center[1], edge[0] - center[0]);

    const points: Point2D[] = [];
    for (let i = 0; i <= sides; i++) {
        const theta = startAngle + (i / sides) * Math.PI * 2;
        points.push([
            center[0] + Math.cos(theta) * radius,
            center[1] + Math.sin(theta) * radius,
        ]);
    }
    return points;
}

function getSplineDisplayPoints(entity: SketchEntity, segments = 50): Point2D[] {
    if (entity.points.length < 2) return entity.points;

    // Use Catmull-Rom interpolation
    const pts3d = entity.points.map(p => new THREE.Vector3(p[0], p[1], 0));
    const curve = new THREE.CatmullRomCurve3(pts3d);
    return curve.getPoints(segments).map(p => [p.x, p.y] as Point2D);
}

function getBezierDisplayPoints(entity: SketchEntity, segments = 50): Point2D[] {
    if (entity.points.length < 2) return entity.points;

    const start = entity.points[0];
    const end = entity.points[1];

    // Prefer controlPoints from properties (canonical location after primitiveToEntity),
    // then fall back to points[2] (legacy/direct), then synthesize a midpoint.
    const ctrl: Point2D = entity.properties.controlPoints?.[0]
        ?? (entity.points.length > 2 ? entity.points[2] : undefined)
        ?? [(start[0] + end[0]) / 2 + 5, (start[1] + end[1]) / 2 + 5] as Point2D;

    const points: Point2D[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const mt = 1 - t;
        points.push([
            mt * mt * start[0] + 2 * mt * t * ctrl[0] + t * t * end[0],
            mt * mt * start[1] + 2 * mt * t * ctrl[1] + t * t * end[1],
        ]);
    }
    return points;
}

function getQuadBezierDisplayPoints(entity: SketchEntity, segments = 50): Point2D[] {
    return getBezierDisplayPoints(entity, segments);
}

function getCubicBezierDisplayPoints(entity: SketchEntity, segments = 50): Point2D[] {
    if (entity.points.length < 2) return entity.points;

    const start = entity.points[0];
    const end = entity.points[1];
    const props = entity.properties;

    const ctrl1: Point2D = props.controlPoints?.[0] ?? [
        start[0] + (props.startFactor ?? 3),
        start[1] + (props.endFactor ?? 5),
    ];
    const ctrl2: Point2D = props.controlPoints?.[1] ?? [
        end[0] - (props.startFactor ?? 3),
        end[1] + (props.endFactor ?? 5),
    ];

    const points: Point2D[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const mt = 1 - t;
        points.push([
            mt ** 3 * start[0] + 3 * mt ** 2 * t * ctrl1[0] + 3 * mt * t ** 2 * ctrl2[0] + t ** 3 * end[0],
            mt ** 3 * start[1] + 3 * mt ** 2 * t * ctrl1[1] + 3 * mt * t ** 2 * ctrl2[1] + t ** 3 * end[1],
        ]);
    }
    return points;
}

// ──────────────────────────────────────────────────────────────
// Arc Computation Helper
// ──────────────────────────────────────────────────────────────

export interface ArcResult {
    cx: number;
    cy: number;
    radius: number;
    startAngle: number;
    endAngle: number;
    ccw: boolean;
}

/**
 * Compute arc circle from three points (start, end, via).
 * Returns null if points are collinear.
 */
export function computeArcFromThreePoints(
    start: Point2D,
    end: Point2D,
    via: Point2D,
): ArcResult | null {
    const ax = start[0], ay = start[1];
    const bx = end[0], by = end[1];
    const cx = via[0], cy = via[1];

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-10) return null;

    const ux = ((ax * ax + ay * ay) * (by - cy) +
        (bx * bx + by * by) * (cy - ay) +
        (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) +
        (bx * bx + by * by) * (ax - cx) +
        (cx * cx + cy * cy) * (bx - ax)) / d;

    const radius = Math.hypot(ax - ux, ay - uy);

    if (radius > 10000 || radius < 0.01) return null;

    const startAngle = Math.atan2(ay - uy, ax - ux);
    const endAngle = Math.atan2(by - uy, bx - ux);
    const viaAngle = Math.atan2(cy - uy, cx - ux);

    // Determine if via point is on the CCW arc from start to end
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const ccw = cross > 0;

    return { cx: ux, cy: uy, radius, startAngle, endAngle, ccw };
}

// ──────────────────────────────────────────────────────────────
// Grid Snapping
// ──────────────────────────────────────────────────────────────

/**
 * Snap a point to the nearest grid intersection.
 */
export function snapToGrid(point: Point2D, gridSize: number): Point2D {
    return [
        Math.round(point[0] / gridSize) * gridSize,
        Math.round(point[1] / gridSize) * gridSize,
    ];
}

/**
 * Snap a value to the nearest grid step.
 */
export function snapToGridValue(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
}

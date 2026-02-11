/**
 * Sketch Data Model — The persistent, editable sketch representation.
 * 
 * Sketches are stored as first-class objects alongside generated code,
 * enabling re-editing, version tracking, and independent persistence.
 * 
 * Coordinate convention: all 2D points are in sketch-local (u, v) space.
 * The mapping to 3D world coordinates depends on the sketch plane.
 */

// ──────────────────────────────────────────────────────────────
// Entity Types
// ──────────────────────────────────────────────────────────────

export type SketchEntityType =
    | 'line'
    | 'arc'            // legacy alias for threePointsArc
    | 'threePointsArc'
    | 'circle'
    | 'rectangle'
    | 'roundedRectangle'
    | 'polygon'
    | 'smoothSpline'
    | 'spline'         // legacy alias for smoothSpline
    | 'bezier'
    | 'quadraticBezier'
    | 'cubicBezier'
    | 'text'
    | 'ellipse'
    | 'constructionLine'
    | 'constructionCircle'
    | 'centerPointArc';

// ──────────────────────────────────────────────────────────────
// Point Types
// ──────────────────────────────────────────────────────────────

export type Point2D = [number, number];

// ──────────────────────────────────────────────────────────────
// Sketch Entity — The atomic drawing element
// ──────────────────────────────────────────────────────────────

export interface SketchEntity {
    /** Unique per-sketch entity ID */
    id: string;
    /** Entity type determines rendering and code generation */
    type: SketchEntityType;
    /** Ordered control points in 2D sketch space */
    points: Point2D[];
    /** Whether this is a construction entity (guides only, not in final profile) */
    construction: boolean;
    /** Type-specific properties */
    properties: SketchEntityProperties;
}

export interface SketchEntityProperties {
    // Polygon
    sides?: number;
    sagitta?: number;
    // Circle / Arc
    radius?: number;
    startAngle?: number;
    endAngle?: number;
    // Rounded rectangle
    cornerRadius?: number;
    // Text
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    // Spline tangents
    startTangent?: number;
    endTangent?: number;
    startFactor?: number;
    endFactor?: number;
    // Bezier control points (stored in points array, but we need flags)
    controlPoints?: Point2D[];
    // Solver integration
    solverId?: string;
    // Dimension lock values recorded at creation
    lockedLength?: number;
    lockedAngle?: number;
    lockedWidth?: number;
    lockedHeight?: number;
    // Polar line
    angle?: number;
    distance?: number;
    // Line deltas
    dx?: number;
    dy?: number;
    // Ellipse
    xRadius?: number;
    yRadius?: number;
    rotation?: number;
    longWay?: boolean;
    counterClockwise?: boolean;
    // Bezier individual control points
    ctrlX?: number;
    ctrlY?: number;
    ctrlStartX?: number;
    ctrlStartY?: number;
    ctrlEndX?: number;
    ctrlEndY?: number;
    // Corner modification
    cornerType?: 'fillet' | 'chamfer';
}

// ──────────────────────────────────────────────────────────────
// Sketch Constraint
// Uses ConstraintType from the solver module for consistency.
// ──────────────────────────────────────────────────────────────

import type { ConstraintType } from '../solver/types';

/** @deprecated Use ConstraintType from solver module */
export type ConstraintKind = ConstraintType;

export interface SketchConstraint {
    id: string;
    type: ConstraintType;
    entityIds: string[];
    value?: number;
}

// ──────────────────────────────────────────────────────────────
// SketchObject — The top-level persistent sketch
// ──────────────────────────────────────────────────────────────

export type SketchPlane = 'XY' | 'XZ' | 'YZ';

export interface SketchObject {
    /** Unique sketch ID (matches the CADObject ID if linked) */
    id: string;
    /** Human-readable name (e.g., "Sketch 1") */
    name: string;
    /** The plane this sketch lives on */
    plane: SketchPlane;
    /** Origin offset of the sketch plane in 3D world */
    origin: [number, number, number];
    /** All sketch entities */
    entities: SketchEntity[];
    /** Constraints between entities */
    constraints: SketchConstraint[];
    /** Whether this sketch is currently being edited */
    isEditing: boolean;
    /** Timestamp of creation */
    createdAt: number;
    /** Timestamp of last modification */
    updatedAt: number;
    /** Feature ID in the code (the variable name) */
    featureId: string | null;
    /** Whether this sketch has been used in an operation (extrude, revolve, etc.) */
    consumed: boolean;
}

// ──────────────────────────────────────────────────────────────
// Serialization
// ──────────────────────────────────────────────────────────────

export interface SerializedSketch {
    id: string;
    name: string;
    plane: SketchPlane;
    origin: [number, number, number];
    entities: SketchEntity[];
    constraints: SketchConstraint[];
    featureId: string | null;
    consumed: boolean;
    createdAt: number;
    updatedAt: number;
}

export function serializeSketch(sketch: SketchObject): SerializedSketch {
    return {
        id: sketch.id,
        name: sketch.name,
        plane: sketch.plane,
        origin: sketch.origin,
        entities: sketch.entities.map(e => ({ ...e })),
        constraints: sketch.constraints.map(c => ({ ...c })),
        featureId: sketch.featureId,
        consumed: sketch.consumed,
        createdAt: sketch.createdAt,
        updatedAt: sketch.updatedAt,
    };
}

export function deserializeSketch(data: SerializedSketch): SketchObject {
    return {
        ...data,
        isEditing: false,
    };
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

let _nextId = 1;
export function generateSketchId(): string {
    return `sk_${Date.now().toString(36)}_${(_nextId++).toString(36)}`;
}

export function generateEntityId(): string {
    return `se_${Date.now().toString(36)}_${(_nextId++).toString(36)}`;
}

export function createSketchObject(
    plane: SketchPlane,
    name?: string,
): SketchObject {
    const id = generateSketchId();
    return {
        id,
        name: name ?? `Sketch ${id.slice(-4)}`,
        plane,
        origin: [0, 0, 0],
        entities: [],
        constraints: [],
        isEditing: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        featureId: null,
        consumed: false,
    };
}

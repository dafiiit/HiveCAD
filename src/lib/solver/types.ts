/**
 * Type definitions for the geometric constraint solver.
 * Based on the planegcs (FreeCAD GCS) entity and constraint model.
 */

// ==================== Entity Types ====================

/** Unique identifier for entities */
export type EntityId = string;

/** Base interface for all geometric entities */
export interface BaseEntity {
    id: EntityId;
    type: EntityType;
    fixed?: boolean; // If true, solver won't modify this entity
}

/** All supported entity types */
export type EntityType = 'point' | 'line' | 'circle' | 'arc';

/** A point in 2D space */
export interface PointEntity extends BaseEntity {
    type: 'point';
    x: number;
    y: number;
}

/** A line defined by two points */
export interface LineEntity extends BaseEntity {
    type: 'line';
    p1Id: EntityId; // ID of start point
    p2Id: EntityId; // ID of end point
}

/** A circle defined by center point and radius */
export interface CircleEntity extends BaseEntity {
    type: 'circle';
    centerId: EntityId;
    radius: number;
}

/** An arc defined by center, start, and end points */
export interface ArcEntity extends BaseEntity {
    type: 'arc';
    centerId: EntityId;
    startId: EntityId;
    endId: EntityId;
    startAngle?: number;
    endAngle?: number;
}

/** Union of all solver entity types */
export type SolverEntity = PointEntity | LineEntity | CircleEntity | ArcEntity;

// ==================== Constraint Types ====================

/** All supported constraint types */
export type ConstraintType =
    | 'coincident'      // Two points at same location
    | 'horizontal'      // Line is horizontal (or two points have same Y)
    | 'vertical'        // Line is vertical (or two points have same X)
    | 'parallel'        // Two lines are parallel
    | 'perpendicular'   // Two lines are perpendicular
    | 'tangent'         // Line tangent to arc/circle, or two arcs tangent
    | 'equal'           // Two lines have equal length, or circles have equal radius
    | 'symmetric'       // Points symmetric about a line
    | 'midpoint'        // Point is at midpoint of line
    | 'distance'        // Fixed distance between points or point-to-line
    | 'angle'           // Angle between two lines
    | 'pointOnLine'     // Point lies on a line
    | 'pointOnCircle'   // Point lies on a circle/arc
    | 'radius'          // Radius of circle/arc
    | 'fixed';          // Entity position is locked

/** A geometric constraint between entities */
export interface SketchConstraint {
    id: string;
    type: ConstraintType;
    entityIds: EntityId[]; // IDs of entities involved in this constraint
    value?: number;        // For distance, angle, etc.
    driving?: boolean;     // True = "driving dimension" (value is enforced)
    // False = "driven dimension" (value is calculated)
}

// ==================== Solver Result Types ====================

/** Result of a solve operation */
export interface SolveResult {
    success: boolean;
    status: SolveStatus;
    updatedEntities: Map<EntityId, { x?: number; y?: number; radius?: number }>;
    iterations?: number;
    error?: string;
}

/** Solver status codes (matching planegcs) */
export type SolveStatus =
    | 'solved'           // All constraints satisfied
    | 'partialSolution'  // Some constraints could not be satisfied
    | 'failed'           // Solver failed to converge
    | 'redundant'        // Over-constrained (redundant constraints)
    | 'inconsistent';    // Conflicting constraints

// ==================== Helper Types ====================

/** Initial parameters for creating a point */
export interface CreatePointParams {
    x: number;
    y: number;
    fixed?: boolean;
}

/** Initial parameters for creating a line */
export interface CreateLineParams {
    p1: CreatePointParams;
    p2: CreatePointParams;
}

/** Initial parameters for creating a circle */
export interface CreateCircleParams {
    center: CreatePointParams;
    radius: number;
}

/** Event emitted when entities are updated by the solver */
export interface EntityUpdateEvent {
    entityId: EntityId;
    oldValues: Partial<PointEntity | CircleEntity>;
    newValues: Partial<PointEntity | CircleEntity>;
}

// ==================== Utility Functions ====================

/** Generate a unique entity ID */
export const generateEntityId = (): EntityId => {
    return `e_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
};

/** Generate a unique constraint ID */
export const generateConstraintId = (): string => {
    return `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
};

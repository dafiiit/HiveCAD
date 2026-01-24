/**
 * ConstraintSolver - High-level wrapper around planegcs for the CAD application.
 * 
 * This module provides a simplified interface for:
 * - Adding geometric entities (points, lines, circles, arcs)
 * - Adding constraints between entities
 * - Solving the constraint system when entities are dragged
 * - Retrieving updated entity positions
 */

import {
    make_gcs_wrapper,
    GcsWrapper,
    Algorithm,
    SolveStatus as PlanegcsSolveStatus,
    type SketchPoint,
    type SketchLine,
    type SketchCircle,
    type SketchArc,
    type SketchPrimitive
} from '@salusoft89/planegcs';
import type { Constraint } from '@salusoft89/planegcs';
import {
    type EntityId,
    type SketchEntity,
    type PointEntity,
    type LineEntity,
    type CircleEntity,
    type ArcEntity,
    type SketchConstraint,
    type ConstraintType,
    type SolveResult,
    type SolveStatus,
    generateEntityId,
    generateConstraintId
} from './types';

// Module-level singleton for the wrapper
let sharedWrapper: GcsWrapper | null = null;
let initPromise: Promise<GcsWrapper> | null = null;

/**
 * Initialize the planegcs WASM module and create a shared wrapper (singleton).
 */
export async function initSolver(): Promise<GcsWrapper> {
    if (sharedWrapper) return sharedWrapper;

    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        const wrapper = await make_gcs_wrapper();
        sharedWrapper = wrapper;
        return wrapper;
    })();

    return initPromise;
}

/**
 * ConstraintSolver provides a high-level interface for geometric constraint solving.
 * 
 * Usage:
 * 1. Create instance: `const solver = new ConstraintSolver()`
 * 2. Initialize: `await solver.initialize()`
 * 3. Add entities: `solver.addPoint(x, y)`, `solver.addLine(p1Id, p2Id)`
 * 4. Add constraints: `solver.addConstraint('coincident', [p1Id, p2Id])`
 * 5. Set driving dimensions: `solver.setDrivingPoint(id, newX, newY)`
 * 6. Solve: `const result = solver.solve()`
 * 7. Get updated positions: `solver.getPoint(id)`
 */
export class ConstraintSolver {
    private wrapper: GcsWrapper | null = null;

    // Local tracking of entities (for fast lookup and to convert back to our types)
    private entities: Map<EntityId, SketchEntity> = new Map();
    private constraints: Map<string, SketchConstraint> = new Map();

    // Track which entities are being used as driving dimensions
    private drivingPoints: Set<EntityId> = new Set();

    /**
     * Initialize the solver. Must be called before using other methods.
     */
    async initialize(): Promise<void> {
        // Each solver instance gets its own wrapper for isolation
        this.wrapper = await make_gcs_wrapper();
    }

    /**
     * Check if solver is initialized.
     */
    get isInitialized(): boolean {
        return this.wrapper !== null;
    }

    /**
     * Clear all entities and constraints.
     */
    clear(): void {
        if (this.wrapper) {
            this.wrapper.clear_data();
        }
        this.entities.clear();
        this.constraints.clear();
        this.drivingPoints.clear();
    }

    /**
     * Rebuild the solver from current entities and constraints.
     * This is needed after modifying driving points.
     */
    private rebuild(): void {
        if (!this.wrapper) return;

        this.wrapper.clear_data();

        // Re-push all primitives
        const primitives: SketchPrimitive[] = [];

        // First, add all points
        this.entities.forEach((entity, id) => {
            if (entity.type === 'point') {
                const point: SketchPoint = {
                    id,
                    type: 'point',
                    x: entity.x,
                    y: entity.y,
                    fixed: entity.fixed || this.drivingPoints.has(id)
                };
                primitives.push(point);
            }
        });

        // Then add lines (they reference points)
        this.entities.forEach((entity, id) => {
            if (entity.type === 'line') {
                const line: SketchLine = {
                    id,
                    type: 'line',
                    p1_id: entity.p1Id,
                    p2_id: entity.p2Id
                };
                primitives.push(line);
            }
        });

        // Then circles
        this.entities.forEach((entity, id) => {
            if (entity.type === 'circle') {
                const circle: SketchCircle = {
                    id,
                    type: 'circle',
                    c_id: entity.centerId,
                    radius: entity.radius
                };
                primitives.push(circle);
            }
        });

        // Then arcs
        this.entities.forEach((entity, id) => {
            if (entity.type === 'arc') {
                const arc: SketchArc = {
                    id,
                    type: 'arc',
                    c_id: entity.centerId,
                    start_id: entity.startId,
                    end_id: entity.endId,
                    start_angle: entity.startAngle || 0,
                    end_angle: entity.endAngle || Math.PI,
                    radius: 1 // Will be calculated from points
                };
                primitives.push(arc);
            }
        });

        // Push all primitives to the wrapper
        for (const prim of primitives) {
            this.wrapper.push_primitive(prim);
        }

        // Now add constraints
        this.constraints.forEach((constraint) => {
            this.pushConstraintToWrapper(constraint);
        });
    }

    /**
     * Add a point entity.
     */
    addPoint(x: number, y: number, fixed = false): EntityId {
        const id = generateEntityId();
        const entity: PointEntity = {
            id,
            type: 'point',
            x,
            y,
            fixed
        };
        this.entities.set(id, entity);

        if (this.wrapper) {
            const point: SketchPoint = { id, type: 'point', x, y, fixed };
            this.wrapper.push_primitive(point);
        }

        return id;
    }

    /**
     * Add a line entity from two existing points.
     */
    addLine(p1Id: EntityId, p2Id: EntityId): EntityId {
        const id = generateEntityId();
        const entity: LineEntity = {
            id,
            type: 'line',
            p1Id,
            p2Id
        };
        this.entities.set(id, entity);

        if (this.wrapper) {
            const line: SketchLine = { id, type: 'line', p1_id: p1Id, p2_id: p2Id };
            this.wrapper.push_primitive(line);
        }

        return id;
    }

    /**
     * Add a circle entity.
     */
    addCircle(centerId: EntityId, radius: number): EntityId {
        const id = generateEntityId();
        const entity: CircleEntity = {
            id,
            type: 'circle',
            centerId,
            radius
        };
        this.entities.set(id, entity);

        if (this.wrapper) {
            const circle: SketchCircle = { id, type: 'circle', c_id: centerId, radius };
            this.wrapper.push_primitive(circle);
        }

        return id;
    }

    /**
     * Add an arc entity.
     */
    addArc(centerId: EntityId, startId: EntityId, endId: EntityId): EntityId {
        const id = generateEntityId();
        const entity: ArcEntity = {
            id,
            type: 'arc',
            centerId,
            startId,
            endId,
            startAngle: 0,
            endAngle: Math.PI
        };
        this.entities.set(id, entity);

        if (this.wrapper) {
            const arc: SketchArc = {
                id,
                type: 'arc',
                c_id: centerId,
                start_id: startId,
                end_id: endId,
                start_angle: 0,
                end_angle: Math.PI,
                radius: 1
            };
            this.wrapper.push_primitive(arc);
        }

        return id;
    }

    /**
     * Convert our constraint type to planegcs constraint format.
     */
    private pushConstraintToWrapper(constraint: SketchConstraint): void {
        if (!this.wrapper) return;

        const { type, entityIds, value } = constraint;
        let gcsConstraint: Constraint;

        switch (type) {
            case 'coincident':
                gcsConstraint = {
                    id: constraint.id,
                    type: 'p2p_coincident',
                    p1_id: entityIds[0],
                    p2_id: entityIds[1]
                };
                break;

            case 'horizontal':
                if (entityIds.length === 1) {
                    // Horizontal line
                    gcsConstraint = {
                        id: constraint.id,
                        type: 'horizontal_l',
                        l_id: entityIds[0]
                    };
                } else {
                    // Two points horizontally aligned
                    gcsConstraint = {
                        id: constraint.id,
                        type: 'horizontal_pp',
                        p1_id: entityIds[0],
                        p2_id: entityIds[1]
                    };
                }
                break;

            case 'vertical':
                if (entityIds.length === 1) {
                    gcsConstraint = {
                        id: constraint.id,
                        type: 'vertical_l',
                        l_id: entityIds[0]
                    };
                } else {
                    gcsConstraint = {
                        id: constraint.id,
                        type: 'vertical_pp',
                        p1_id: entityIds[0],
                        p2_id: entityIds[1]
                    };
                }
                break;

            case 'parallel':
                gcsConstraint = {
                    id: constraint.id,
                    type: 'parallel',
                    l1_id: entityIds[0],
                    l2_id: entityIds[1]
                };
                break;

            case 'perpendicular':
                gcsConstraint = {
                    id: constraint.id,
                    type: 'perpendicular_ll',
                    l1_id: entityIds[0],
                    l2_id: entityIds[1]
                };
                break;

            case 'equal':
                // Equal length lines
                gcsConstraint = {
                    id: constraint.id,
                    type: 'equal_length',
                    l1_id: entityIds[0],
                    l2_id: entityIds[1]
                };
                break;

            case 'distance':
                gcsConstraint = {
                    id: constraint.id,
                    type: 'p2p_distance',
                    p1_id: entityIds[0],
                    p2_id: entityIds[1],
                    distance: value || 0,
                    driving: constraint.driving ?? true
                };
                break;

            case 'angle':
                gcsConstraint = {
                    id: constraint.id,
                    type: 'l2l_angle_ll',
                    l1_id: entityIds[0],
                    l2_id: entityIds[1],
                    angle: value || 0,
                    driving: constraint.driving ?? true
                };
                break;

            case 'pointOnLine':
                gcsConstraint = {
                    id: constraint.id,
                    type: 'point_on_line_pl',
                    p_id: entityIds[0],
                    l_id: entityIds[1]
                };
                break;

            case 'pointOnCircle':
                gcsConstraint = {
                    id: constraint.id,
                    type: 'point_on_circle',
                    p_id: entityIds[0],
                    c_id: entityIds[1]
                };
                break;

            case 'tangent':
                // Tangent line to circle
                gcsConstraint = {
                    id: constraint.id,
                    type: 'tangent_lc',
                    l_id: entityIds[0],
                    c_id: entityIds[1]
                };
                break;

            case 'midpoint':
                // Point at midpoint of line
                gcsConstraint = {
                    id: constraint.id,
                    type: 'midpoint_on_line_ll',
                    l1_id: entityIds[0],
                    l2_id: entityIds[1]
                };
                break;

            default:
                console.warn(`Unsupported constraint type: ${type}`);
                return;
        }

        this.wrapper.push_primitive(gcsConstraint as SketchPrimitive);
    }

    /**
     * Add a constraint between entities.
     */
    addConstraint(
        type: ConstraintType,
        entityIds: EntityId[],
        value?: number,
        driving = true
    ): string {
        const id = generateConstraintId();
        const constraint: SketchConstraint = {
            id,
            type,
            entityIds,
            value,
            driving
        };
        this.constraints.set(id, constraint);

        // Push to wrapper
        this.pushConstraintToWrapper(constraint);

        return id;
    }

    /**
     * Set a point as a "driving point" (fixed position that drives the solution).
     * Use this when dragging a point to move connected geometry.
     */
    setDrivingPoint(id: EntityId, x: number, y: number): void {
        const entity = this.entities.get(id);
        if (!entity || entity.type !== 'point') {
            console.warn(`Entity ${id} is not a point`);
            return;
        }

        // Update the entity position
        entity.x = x;
        entity.y = y;

        // Mark as driving
        this.drivingPoints.add(id);

        // Rebuild is needed to update fixed status
        this.rebuild();
    }

    /**
     * Clear driving point status (after dragging is complete).
     */
    clearDrivingPoint(id: EntityId): void {
        this.drivingPoints.delete(id);
        this.rebuild();
    }

    /**
     * Clear all driving points.
     */
    clearAllDrivingPoints(): void {
        this.drivingPoints.clear();
        this.rebuild();
    }

    /**
     * Run the constraint solver.
     */
    solve(): SolveResult {
        if (!this.wrapper) {
            return {
                success: false,
                status: 'failed',
                updatedEntities: new Map(),
                error: 'Solver not initialized'
            };
        }

        // Run the solver
        const status = this.wrapper.solve(Algorithm.DogLeg);

        // Map planegcs status to our status
        const statusMap: Record<PlanegcsSolveStatus, SolveStatus> = {
            [PlanegcsSolveStatus.Success]: 'solved',
            [PlanegcsSolveStatus.Converged]: 'solved',
            [PlanegcsSolveStatus.Failed]: 'failed',
            [PlanegcsSolveStatus.SuccessfulSolutionInvalid]: 'partialSolution'
        };

        const solveStatus: SolveStatus = statusMap[status] || 'failed';
        const success = status === PlanegcsSolveStatus.Success || status === PlanegcsSolveStatus.Converged;

        if (success) {
            // Apply the solution and update our local entities
            this.wrapper.apply_solution();

            // Pull updated values back from the wrapper
            const updatedEntities = new Map<EntityId, { x?: number; y?: number; radius?: number }>();

            this.entities.forEach((entity, id) => {
                if (entity.type === 'point') {
                    const point = this.wrapper!.sketch_index.get_sketch_point(id);
                    if (point) {
                        const oldX = entity.x;
                        const oldY = entity.y;
                        entity.x = point.x;
                        entity.y = point.y;

                        if (oldX !== point.x || oldY !== point.y) {
                            updatedEntities.set(id, { x: point.x, y: point.y });
                        }
                    }
                } else if (entity.type === 'circle') {
                    // Get updated radius if applicable
                    const circle = this.wrapper!.sketch_index.get_primitive(id);
                    if (circle && 'radius' in circle) {
                        const oldRadius = entity.radius;
                        entity.radius = (circle as SketchCircle).radius;
                        if (oldRadius !== entity.radius) {
                            updatedEntities.set(id, { radius: entity.radius });
                        }
                    }
                }
            });

            return {
                success: true,
                status: solveStatus,
                updatedEntities
            };
        }

        // Check for conflicting or redundant constraints
        if (this.wrapper.has_gcs_conflicting_constraints()) {
            const conflicting = this.wrapper.get_gcs_conflicting_constraints();
            return {
                success: false,
                status: 'inconsistent',
                updatedEntities: new Map(),
                error: `Conflicting constraints: ${conflicting.join(', ')}`
            };
        }

        if (this.wrapper.has_gcs_redundant_constraints()) {
            const redundant = this.wrapper.get_gcs_redundant_constraints();
            return {
                success: false,
                status: 'redundant',
                updatedEntities: new Map(),
                error: `Redundant constraints: ${redundant.join(', ')}`
            };
        }

        return {
            success: false,
            status: solveStatus,
            updatedEntities: new Map(),
            error: 'Solver failed to converge'
        };
    }

    /**
     * Get a point entity by ID.
     */
    getPoint(id: EntityId): PointEntity | undefined {
        const entity = this.entities.get(id);
        return entity?.type === 'point' ? entity : undefined;
    }

    /**
     * Get a line entity by ID.
     */
    getLine(id: EntityId): LineEntity | undefined {
        const entity = this.entities.get(id);
        return entity?.type === 'line' ? entity : undefined;
    }

    /**
     * Get a circle entity by ID.
     */
    getCircle(id: EntityId): CircleEntity | undefined {
        const entity = this.entities.get(id);
        return entity?.type === 'circle' ? entity : undefined;
    }

    /**
     * Get all entities.
     */
    getAllEntities(): SketchEntity[] {
        return Array.from(this.entities.values());
    }

    /**
     * Get all points.
     */
    getAllPoints(): PointEntity[] {
        return Array.from(this.entities.values()).filter(
            (e): e is PointEntity => e.type === 'point'
        );
    }

    /**
     * Get all constraints.
     */
    getAllConstraints(): SketchConstraint[] {
        return Array.from(this.constraints.values());
    }

    /**
     * Remove an entity and its associated constraints.
     */
    removeEntity(id: EntityId): void {
        this.entities.delete(id);

        // Remove constraints that reference this entity
        const toRemove: string[] = [];
        this.constraints.forEach((constraint, constraintId) => {
            if (constraint.entityIds.includes(id)) {
                toRemove.push(constraintId);
            }
        });
        toRemove.forEach(cid => this.constraints.delete(cid));

        // Rebuild the solver
        this.rebuild();
    }

    /**
     * Remove a constraint.
     */
    removeConstraint(id: string): void {
        this.constraints.delete(id);
        this.rebuild();
    }

    /**
     * Destroy the solver and free resources.
     */
    destroy(): void {
        if (this.wrapper) {
            this.wrapper.destroy_gcs_module();
            this.wrapper = null;
        }
        this.entities.clear();
        this.constraints.clear();
        this.drivingPoints.clear();
    }
}

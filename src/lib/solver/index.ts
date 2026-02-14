/**
 * Geometric Constraint Solver Module
 * 
 * This module provides a 2D geometric constraint solver for the CAD sketching system.
 * It uses planegcs (FreeCAD's solver) under the hood.
 * 
 * @example
 * ```typescript
 * import { ConstraintSolver, initSolver } from './lib/solver';
 * 
 * // Initialize the WASM module
 * await initSolver();
 * 
 * // Create a solver instance
 * const solver = new ConstraintSolver();
 * await solver.initialize();
 * 
 * // Add a rectangle (4 points + 4 lines + constraints)
 * const p1 = solver.addPoint(0, 0);
 * const p2 = solver.addPoint(10, 0);
 * const p3 = solver.addPoint(10, 5);
 * const p4 = solver.addPoint(0, 5);
 * 
 * const l1 = solver.addLine(p1, p2);
 * const l2 = solver.addLine(p2, p3);
 * const l3 = solver.addLine(p3, p4);
 * const l4 = solver.addLine(p4, p1);
 * 
 * // Add perpendicular constraints for rectangle corners
 * solver.addConstraint('perpendicular', [l1, l2]);
 * solver.addConstraint('perpendicular', [l2, l3]);
 * solver.addConstraint('perpendicular', [l3, l4]);
 * solver.addConstraint('perpendicular', [l4, l1]);
 * 
 * // Add equal length constraints
 * solver.addConstraint('equal', [l1, l3]); // Top and bottom equal
 * solver.addConstraint('equal', [l2, l4]); // Left and right equal
 * 
 * // Drag a corner
 * solver.setDrivingPoint(p3, 15, 8);
 * const result = solver.solve();
 * 
 * // All points are now updated to maintain constraints
 * console.log(solver.getPoint(p1)); // Updated position
 * ```
 */

export { ConstraintSolver, initSolver } from './ConstraintSolver';

export type {
    EntityId,
    EntityType,
    BaseEntity,
    PointEntity,
    LineEntity,
    CircleEntity,
    ArcEntity,
    SolverEntity,
    ConstraintType,
    SketchConstraint,
    SolveResult,
    SolveStatus,
    CreatePointParams,
    CreateLineParams,
    CreateCircleParams,
    EntityUpdateEvent
} from './types';

export { generateEntityId, generateConstraintId } from './types';

// Constraint metadata system
export {
    CONSTRAINT_META,
    validateConstraintSelection,
    buildRequirementMessage,
    getNextSelectionPrompt,
    isEntityAcceptableAtStep,
    getConstraintSummary,
} from './constraint-meta';
export type { ConstraintMeta, ConstraintSelectionStep } from './constraint-meta';

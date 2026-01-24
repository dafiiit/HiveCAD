/**
 * Unit tests for the ConstraintSolver
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConstraintSolver } from '../lib/solver';

describe('ConstraintSolver', () => {
    let solver: ConstraintSolver;

    beforeEach(async () => {
        solver = new ConstraintSolver();
        await solver.initialize();
    });

    afterEach(() => {
        solver.destroy();
    });

    describe('initialization', () => {
        it('should initialize successfully', () => {
            expect(solver.isInitialized).toBe(true);
        });
    });

    describe('point entities', () => {
        it('should add a point entity', () => {
            const id = solver.addPoint(10, 20);
            expect(id).toBeDefined();

            const point = solver.getPoint(id);
            expect(point).toBeDefined();
            expect(point?.x).toBe(10);
            expect(point?.y).toBe(20);
        });

        it('should add multiple points', () => {
            const id1 = solver.addPoint(0, 0);
            const id2 = solver.addPoint(10, 0);
            const id3 = solver.addPoint(10, 10);

            expect(solver.getAllPoints()).toHaveLength(3);
        });

        it('should add a fixed point', () => {
            const id = solver.addPoint(5, 5, true);
            const point = solver.getPoint(id);
            expect(point?.fixed).toBe(true);
        });
    });

    describe('line entities', () => {
        it('should add a line between two points', () => {
            const p1 = solver.addPoint(0, 0);
            const p2 = solver.addPoint(10, 0);
            const lineId = solver.addLine(p1, p2);

            expect(lineId).toBeDefined();
            const line = solver.getLine(lineId);
            expect(line).toBeDefined();
            expect(line?.p1Id).toBe(p1);
            expect(line?.p2Id).toBe(p2);
        });
    });

    describe('constraints', () => {
        it('should add a horizontal constraint', () => {
            const p1 = solver.addPoint(0, 0);
            const p2 = solver.addPoint(10, 5); // Intentionally not horizontal
            const lineId = solver.addLine(p1, p2);

            const constraintId = solver.addConstraint('horizontal', [lineId]);
            expect(constraintId).toBeDefined();
            expect(solver.getAllConstraints()).toHaveLength(1);
        });

        it('should add a coincident constraint', () => {
            const p1 = solver.addPoint(0, 0);
            const p2 = solver.addPoint(1, 1);

            const constraintId = solver.addConstraint('coincident', [p1, p2]);
            expect(constraintId).toBeDefined();
        });

        it('should add a perpendicular constraint', () => {
            const p1 = solver.addPoint(0, 0);
            const p2 = solver.addPoint(10, 0);
            const p3 = solver.addPoint(10, 10);
            const p4 = solver.addPoint(0, 10);

            const l1 = solver.addLine(p1, p2);
            const l2 = solver.addLine(p2, p3);

            const constraintId = solver.addConstraint('perpendicular', [l1, l2]);
            expect(constraintId).toBeDefined();
        });
    });

    describe('solving', () => {
        it('should solve a simple horizontal constraint', async () => {
            // Create a line that's not horizontal
            const p1 = solver.addPoint(0, 0, true); // Fixed point
            const p2 = solver.addPoint(10, 5); // Not on same Y
            const lineId = solver.addLine(p1, p2);

            // Add horizontal constraint
            solver.addConstraint('horizontal', [lineId]);

            // Solve
            const result = solver.solve();

            // The solver should adjust p2's Y to match p1's Y (0)
            expect(result.success).toBe(true);

            const solvedP2 = solver.getPoint(p2);
            expect(solvedP2?.y).toBeCloseTo(0, 5); // Y should be ~0 (horizontal with p1)
        });

        it('should solve coincident constraint', async () => {
            const p1 = solver.addPoint(0, 0, true); // Fixed
            const p2 = solver.addPoint(5, 5);

            solver.addConstraint('coincident', [p1, p2]);

            const result = solver.solve();
            expect(result.success).toBe(true);

            const solvedP2 = solver.getPoint(p2);
            expect(solvedP2?.x).toBeCloseTo(0, 5);
            expect(solvedP2?.y).toBeCloseTo(0, 5);
        });
    });

    describe('driving points', () => {
        it('should set a driving point to the specified position', async () => {
            const p1 = solver.addPoint(0, 0, true); // Fixed origin
            const p2 = solver.addPoint(10, 0);
            const lineId = solver.addLine(p1, p2);

            // First solve to establish positions
            solver.solve();

            // Now drag p2 to a new position (simulating mouse move)
            // When a point is "driving", it becomes fixed at the new position
            solver.setDrivingPoint(p2, 20, 5);
            const result = solver.solve();

            expect(result.success).toBe(true);

            // p2 should be at the driving position (20, 5)
            // Driving points are fixed, so constraints don't override them
            const solvedP2 = solver.getPoint(p2);
            expect(solvedP2?.x).toBeCloseTo(20, 5);
            expect(solvedP2?.y).toBeCloseTo(5, 5);
        });
    });

    describe('rectangle with constraints', () => {
        it('should create a rectangle with perpendicular corners', async () => {
            // Create 4 corner points
            const p1 = solver.addPoint(0, 0, true);  // Fixed corner
            const p2 = solver.addPoint(10, 0);
            const p3 = solver.addPoint(10, 5);
            const p4 = solver.addPoint(0, 5);

            // Create 4 sides
            const l1 = solver.addLine(p1, p2); // Bottom
            const l2 = solver.addLine(p2, p3); // Right
            const l3 = solver.addLine(p3, p4); // Top
            const l4 = solver.addLine(p4, p1); // Left

            // Add perpendicular constraints for each corner
            solver.addConstraint('perpendicular', [l1, l2]);
            solver.addConstraint('perpendicular', [l2, l3]);
            solver.addConstraint('perpendicular', [l3, l4]);
            solver.addConstraint('perpendicular', [l4, l1]);

            // Solve
            const result = solver.solve();
            expect(result.success).toBe(true);

            // All corners should still form a rectangle
            const solvedP1 = solver.getPoint(p1);
            const solvedP2 = solver.getPoint(p2);
            const solvedP3 = solver.getPoint(p3);
            const solvedP4 = solver.getPoint(p4);

            // Bottom edge should be horizontal
            expect(solvedP1?.y).toBeCloseTo(solvedP2?.y || 0, 3);
            // Right edge should be vertical
            expect(solvedP2?.x).toBeCloseTo(solvedP3?.x || 0, 3);
        });
    });

    describe('cleanup', () => {
        it('should clear all entities and constraints', () => {
            solver.addPoint(0, 0);
            solver.addPoint(10, 10);

            solver.clear();

            expect(solver.getAllEntities()).toHaveLength(0);
            expect(solver.getAllConstraints()).toHaveLength(0);
        });

        it('should remove a specific entity', () => {
            const p1 = solver.addPoint(0, 0);
            const p2 = solver.addPoint(10, 10);

            solver.removeEntity(p1);

            expect(solver.getAllPoints()).toHaveLength(1);
            expect(solver.getPoint(p1)).toBeUndefined();
        });
    });
});

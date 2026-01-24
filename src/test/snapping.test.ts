import { describe, it, expect, beforeEach } from 'vitest';
import { SnappingEngine, SnapPointType, SnapResult } from '../lib/snapping';
import { SketchPrimitive } from '../hooks/useCADStore';

describe('SnappingEngine', () => {
    let engine: SnappingEngine;

    beforeEach(() => {
        engine = new SnappingEngine({
            snapDistance: 2, // Use 2 units to avoid overlapping snaps on small geometry
            snapToEndpoints: true,
            snapToMidpoints: true,
            snapToCenters: true
        });
    });

    const createLine = (id: string, x1: number, y1: number, x2: number, y2: number): SketchPrimitive => ({
        id,
        type: 'line',
        points: [[x1, y1], [x2, y2]]
    });

    const createCircle = (id: string, cx: number, cy: number, edgeX: number, edgeY: number): SketchPrimitive => ({
        id,
        type: 'circle',
        points: [[cx, cy], [edgeX, edgeY]]
    });

    describe('Entities & Quadtree', () => {
        it('should accept entities and build index', () => {
            const line = createLine('l1', 0, 0, 10, 0);
            engine.setEntities([line]);

            // Should find snap at (0,0)
            const result = engine.findSnapTarget(0.1, 0.1);
            expect(result).toBeDefined();
            expect(result?.snapPoint.type).toBe('endpoint');
        });
    });

    describe('Endpoint Snapping', () => {
        it('should snap to exact endpoints', () => {
            const line = createLine('l1', 10, 10, 20, 20);
            engine.setEntities([line]);

            const result = engine.findSnapTarget(10.5, 10.5);
            expect(result).not.toBeNull();
            expect(result?.x).toBe(10);
            expect(result?.y).toBe(10);
            expect(result?.snapPoint.type).toBe('endpoint');
        });

        it('should prefer closer endpoint', () => {
            const line = createLine('l1', 0, 0, 10, 0);
            engine.setEntities([line]);

            // Closer to 0,0
            const nearStart = engine.findSnapTarget(1, 0);
            expect(nearStart?.x).toBe(0);

            // Closer to 10,0
            const nearEnd = engine.findSnapTarget(9, 0);
            expect(nearEnd?.x).toBe(10);
        });
    });

    describe('Midpoint Snapping', () => {
        it('should snap to line midpoint', () => {
            const line = createLine('l1', 0, 0, 10, 0); // Midpoint at 5,0
            engine.setEntities([line]);

            const result = engine.findSnapTarget(5.1, 0.1);
            expect(result).not.toBeNull();
            expect(result?.x).toBe(5);
            expect(result?.y).toBe(0);
            expect(result?.snapPoint.type).toBe('midpoint');
        });
    });

    describe('Center Snapping', () => {
        it('should snap to circle center', () => {
            const circle = createCircle('c1', 10, 10, 15, 10); // Center at 10,10, r=5
            engine.setEntities([circle]);

            const result = engine.findSnapTarget(10.2, 9.8);
            expect(result).not.toBeNull();
            expect(result?.x).toBe(10);
            expect(result?.y).toBe(10);
            expect(result?.snapPoint.type).toBe('center');
        });
    });

    describe('Virtual Constraints', () => {
        it('should support horizontal alignment', () => {
            // Need a reference point to align to
            const line = createLine('l1', 0, 0, 10, 0); // Endpoints at (0,0) and (10,0)
            engine.setEntities([line]);

            // Move cursor to (5, 0.1) -> Should align horizontally with (0,0) and (10,0)
            // But midpoint is also there. Let's try aligning with Y=0 from far away X

            // Cursor at (20, 0.2)
            const result = engine.findSnapTarget(20, 0.2);

            // Should snap Y to 0
            expect(result).not.toBeNull();
            expect(result?.y).toBe(0);
            expect(result?.x).toBe(20); // X should not change
            expect(result?.snapPoint.type).toBe('horizontal');
        });

        it('should support vertical alignment', () => {
            const line = createLine('l1', 10, 10, 20, 20); // Points at 10,10 and 20,20
            engine.setEntities([line]);

            // Cursor matching vertical X=10
            const result = engine.findSnapTarget(10.1, 50);

            expect(result).not.toBeNull();
            expect(result?.x).toBe(10);
            expect(result?.y).toBe(50);
            expect(result?.snapPoint.type).toBe('vertical');
        });
    });
});

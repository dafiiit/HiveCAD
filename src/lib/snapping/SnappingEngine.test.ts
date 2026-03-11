import { beforeEach, describe, expect, it } from 'vitest';
import { SnappingEngine } from './SnappingEngine';
import type { SketchPrimitive } from '../../hooks/useCADStore';

describe('SnappingEngine line interior snapping', () => {
    let engine: SnappingEngine;

    beforeEach(() => {
        engine = new SnappingEngine({
            snapDistance: 2,
            snapToEndpoints: true,
            snapToMidpoints: true,
            snapToCenters: true,
        });
    });

    it('snaps to a line segment interior and exposes point-on-line metadata', () => {
        const line: SketchPrimitive = {
            id: 'line-1',
            type: 'line',
            points: [[0, 0], [10, 0]],
        };

        engine.setEntities([line]);

        const result = engine.findSnapTarget(2.4, 0.4, 'drag-source');

        expect(result).not.toBeNull();
        expect(result?.x).toBeCloseTo(2.4, 8);
        expect(result?.y).toBeCloseTo(0, 8);
        expect(result?.snapPoint.type).toBe('curve');
        expect(result?.snapPoint.sourceEntityId).toBe('line-1');
        expect(result?.snapPoint.metadata?.primitiveConstraintType).toBe('pointOnLine');
        expect(result?.snapPoint.metadata?.constraintValue).toBeCloseTo(0.24, 8);
    });
});
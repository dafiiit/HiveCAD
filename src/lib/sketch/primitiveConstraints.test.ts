import { describe, expect, it } from 'vitest';
import { buildPrimitiveCoincidentConstraintId, buildPrimitiveLineConstraintId } from './primitiveConstraints';

class TestWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    postMessage(): void {}
    terminate(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
}

if (!('Worker' in globalThis)) {
    Object.defineProperty(globalThis, 'Worker', {
        value: TestWorker,
        writable: true,
        configurable: true,
    });
}

if (!('navigator' in globalThis)) {
    Object.defineProperty(globalThis, 'navigator', {
        value: { hardwareConcurrency: 1 },
        writable: true,
        configurable: true,
    });
}

const { createCADStore } = await import('../../store/createCADStore');

describe('primitive sketch constraints', () => {
    it('applies a persistent vertical constraint to selected line primitives without solver entities', () => {
        const store = createCADStore();

        store.setState({
            activeSketchPrimitives: [{
                id: 'line-1',
                type: 'line',
                points: [[0, 0], [10, 5]],
                properties: {},
            }],
            selectedPrimitiveIds: new Set(['line-1']),
        });

        store.getState().applyConstraintToSelection('vertical');

        const line = store.getState().activeSketchPrimitives[0];
        expect(line.points[0][0]).toBeCloseTo(line.points[1][0], 8);
        expect(store.getState().sketchConstraints.some(constraint => constraint.id === buildPrimitiveLineConstraintId('vertical', 'line-1'))).toBe(true);
    });

    it('keeps coincident endpoints connected when a horizontal primitive constraint moves the line', () => {
        const store = createCADStore();

        store.setState({
            activeSketchPrimitives: [
                {
                    id: 'line-1',
                    type: 'line',
                    points: [[0, 0], [10, 5]],
                    properties: {},
                },
                {
                    id: 'line-2',
                    type: 'line',
                    points: [[0, 0], [0, 10]],
                    properties: {},
                },
            ],
            primitiveCoincidents: new Map([
                ['line-1:0', new Set(['line-2:0'])],
                ['line-2:0', new Set(['line-1:0'])],
            ]),
            sketchConstraints: [
                {
                    id: buildPrimitiveCoincidentConstraintId('line-1:0', 'line-2:0'),
                    type: 'coincident',
                    entityIds: ['line-1:0', 'line-2:0'],
                    driving: true,
                },
                {
                    id: buildPrimitiveLineConstraintId('horizontal', 'line-1'),
                    type: 'horizontal',
                    entityIds: ['line-1'],
                    driving: true,
                },
            ],
        });

        store.getState().updatePrimitivePoint('line-1', 1, [10, 4]);

        const [line1, line2] = store.getState().activeSketchPrimitives;
        expect(line1.points[0][1]).toBeCloseTo(line1.points[1][1], 8);
        expect(line1.points[0][1]).toBeCloseTo(4, 8);
        expect(line2.points[0][0]).toBeCloseTo(line1.points[0][0], 8);
        expect(line2.points[0][1]).toBeCloseTo(line1.points[0][1], 8);
    });

    it('removes primitive coincident constraints through the shared remove constraint action', () => {
        const store = createCADStore();

        store.getState().addPrimitiveCoincident('line-1:1', 'line-2:0');
        const constraintId = buildPrimitiveCoincidentConstraintId('line-1:1', 'line-2:0');

        store.getState().removeSolverConstraint(constraintId);

        expect(store.getState().primitiveCoincidents.size).toBe(0);
        expect(store.getState().sketchConstraints.some(constraint => constraint.id === constraintId)).toBe(false);
    });
});
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
    it('keeps sketch primitive and handle selections additive until cleared', () => {
        const store = createCADStore();

        store.getState().selectPrimitive('line-1');
        store.getState().selectPrimitive('arc-1');
        store.getState().selectHandle('line-1:0');
        store.getState().selectHandle('arc-1:2');

        expect(Array.from(store.getState().selectedPrimitiveIds)).toEqual(['line-1', 'arc-1']);
        expect(Array.from(store.getState().selectedHandleIds)).toEqual(['line-1:0', 'arc-1:2']);
    });

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

    it('applies a coincident constraint from preselected line and arc endpoint handles', () => {
        const store = createCADStore();

        store.setState({
            activeSketchPrimitives: [
                {
                    id: 'line-1',
                    type: 'line',
                    points: [[0, 0], [5, 0]],
                    properties: {},
                },
                {
                    id: 'arc-1',
                    type: 'centerPointArc',
                    points: [[10, 10], [12, 10], [10, 12]],
                    properties: {},
                },
            ],
            selectedHandleIds: new Set(['line-1:1', 'arc-1:2']),
        });

        store.getState().applyConstraintToSelection('coincident');

        const constraintId = buildPrimitiveCoincidentConstraintId('line-1:1', 'arc-1:2');
        expect(store.getState().primitiveCoincidents.get('line-1:1')).toEqual(new Set(['arc-1:2']));
        expect(store.getState().primitiveCoincidents.get('arc-1:2')).toEqual(new Set(['line-1:1']));
        expect(store.getState().sketchConstraints.some(constraint => constraint.id === constraintId)).toBe(true);
        expect(store.getState().selectedHandleIds.size).toBe(0);
    });

    it('uses the two most recently selected endpoint handles for coincident constraints', () => {
        const store = createCADStore();

        store.setState({
            selectedHandleIds: new Set(['line-1:0', 'line-2:1', 'arc-1:2']),
        });

        store.getState().applyConstraintToSelection('coincident');

        const expectedId = buildPrimitiveCoincidentConstraintId('line-2:1', 'arc-1:2');
        const unexpectedId = buildPrimitiveCoincidentConstraintId('line-1:0', 'line-2:1');

        expect(store.getState().sketchConstraints.some(constraint => constraint.id === expectedId)).toBe(true);
        expect(store.getState().sketchConstraints.some(constraint => constraint.id === unexpectedId)).toBe(false);
    });
});
import { describe, it, expect } from 'vitest';
import { selectionNameOf, reconcileFaceSelections } from './durableSelection';

const obj = (id: string, faces: [number, string | undefined][]) => ({
    id,
    faceMapping: faces.map(([faceId, name]) => ({ faceId, name })),
});

const objWithEdges = (id: string, edges: [number, string | undefined][]) => ({
    id,
    edgeMapping: edges.map(([edgeId, name]) => ({ edgeId, name })),
});

describe('selectionNameOf', () => {
    it('returns the mapped name for a face selection', () => {
        const objects = [obj('shape1', [[0, 'shape1#F0'], [1, 'shape1#F1']])];
        expect(selectionNameOf('shape1:face-1', objects)).toBe('shape1#F1');
    });

    it('returns the mapped name for an edge selection', () => {
        const objects = [objWithEdges('shape1', [[0, 'E[A~B]'], [1, 'E[B~C]']])];
        expect(selectionNameOf('shape1:edge-1', objects)).toBe('E[B~C]');
    });

    it('returns undefined for whole-object selections', () => {
        expect(selectionNameOf('shape1', [obj('shape1', [[0, 'shape1#F0']])])).toBeUndefined();
    });
});

describe('reconcile edge selections', () => {
    it('rewrites an edge index when the named edge moved', () => {
        const selected = new Set(['shape1:edge-2']);
        const names = new Map([['shape1:edge-2', 'E[A~B]']]);
        const objects = [objWithEdges('shape1', [[0, 'E[X~Y]'], [1, 'E[A~B]']])];

        const r = reconcileFaceSelections(selected, names, objects);
        expect(r.changed).toBe(true);
        expect(r.selectedIds.has('shape1:edge-1')).toBe(true);
        expect(r.selectionNames.get('shape1:edge-1')).toBe('E[A~B]');
    });
});

describe('reconcileFaceSelections', () => {
    it('rewrites the index when a face moved but its name persists', () => {
        // Selected shape1:face-3 (name A). After regen, A is now face 1.
        const selected = new Set(['shape1:face-3']);
        const names = new Map([['shape1:face-3', 'A']]);
        const objects = [obj('shape1', [[0, 'X'], [1, 'A'], [2, 'Y']])];

        const r = reconcileFaceSelections(selected, names, objects);
        expect(r.changed).toBe(true);
        expect(r.selectedIds.has('shape1:face-1')).toBe(true);
        expect(r.selectedIds.has('shape1:face-3')).toBe(false);
        expect(r.selectionNames.get('shape1:face-1')).toBe('A');
    });

    it('keeps the selection unchanged when the index still matches', () => {
        const selected = new Set(['shape1:face-2']);
        const names = new Map([['shape1:face-2', 'A']]);
        const objects = [obj('shape1', [[0, 'X'], [1, 'Y'], [2, 'A']])];

        const r = reconcileFaceSelections(selected, names, objects);
        expect(r.changed).toBe(false);
        expect(r.selectedIds.has('shape1:face-2')).toBe(true);
    });

    it('drops a selection whose named face no longer exists', () => {
        const selected = new Set(['shape1:face-0']);
        const names = new Map([['shape1:face-0', 'GONE']]);
        const objects = [obj('shape1', [[0, 'X'], [1, 'Y']])];

        const r = reconcileFaceSelections(selected, names, objects);
        expect(r.changed).toBe(true);
        expect(r.selectedIds.size).toBe(0);
    });

    it('leaves non-face selections untouched', () => {
        const selected = new Set(['shape1', 'shape2']);
        const r = reconcileFaceSelections(selected, new Map(), []);
        expect(r.selectedIds).toEqual(new Set(['shape1', 'shape2']));
        expect(r.changed).toBe(false);
    });

    it('keeps a face selection with no recorded name as-is', () => {
        const selected = new Set(['shape1:face-0']);
        const objects = [obj('shape1', [[0, 'A']])];
        const r = reconcileFaceSelections(selected, new Map(), objects);
        expect(r.selectedIds.has('shape1:face-0')).toBe(true);
        expect(r.changed).toBe(false);
    });

    it('resolves names independently per object', () => {
        const selected = new Set(['shape1:face-0', 'shape2:face-0']);
        const names = new Map([
            ['shape1:face-0', 'A'],
            ['shape2:face-0', 'B'],
        ]);
        const objects = [
            obj('shape1', [[0, 'Z'], [5, 'A']]),   // A moved to index 5
            obj('shape2', [[0, 'B']]),             // B unchanged
        ];
        const r = reconcileFaceSelections(selected, names, objects);
        expect(r.selectedIds.has('shape1:face-5')).toBe(true);
        expect(r.selectedIds.has('shape2:face-0')).toBe(true);
        expect(r.changed).toBe(true);
    });
});

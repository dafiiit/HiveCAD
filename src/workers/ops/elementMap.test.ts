import { describe, it, expect } from 'vitest';
import { composeElementMap, rootFaceName, edgeComboName, buildEdgeMap, type ElementMap } from './elementMap';
import type { OpHistory } from './history';

/**
 * The composition algorithm is the core of stable naming, so it is tested
 * exhaustively as pure data — no OCCT needed. Faces are integer "hashes".
 */

const history = (h: Partial<OpHistory>): OpHistory => ({
    modified: h.modified ?? new Map(),
    generated: h.generated ?? new Map(),
    deleted: h.deleted ?? new Set(),
    operation: h.operation ?? 'fuse',
});

describe('rootFaceName', () => {
    it('encodes feature id and index', () => {
        expect(rootFaceName('shape1', 0)).toBe('shape1#F0');
        expect(rootFaceName('shape7', 3)).toBe('shape7#F3');
    });
});

describe('edgeComboName', () => {
    it('composes a canonical, order-independent name from two faces', () => {
        expect(edgeComboName(['shape1#F0', 'shape1#F1'])).toBe('E[shape1#F0~shape1#F1]');
        // Order does not matter.
        expect(edgeComboName(['shape1#F1', 'shape1#F0'])).toBe('E[shape1#F0~shape1#F1]');
    });

    it('collapses a seam edge (same face both sides) to one name', () => {
        expect(edgeComboName(['cyl#F0', 'cyl#F0'])).toBe('E[cyl#F0]');
    });
});

describe('buildEdgeMap', () => {
    it('names edges from their adjacent faces', () => {
        const faceMap: ElementMap = new Map([[10, 'A'], [11, 'B'], [12, 'C']]);
        const adjacency = new Map<number, number[]>([
            [100, [10, 11]], // edge between A and B
            [101, [11, 12]], // edge between B and C
        ]);
        const edgeMap = buildEdgeMap(adjacency, faceMap);
        expect(edgeMap.get(100)).toBe('E[A~B]');
        expect(edgeMap.get(101)).toBe('E[B~C]');
    });

    it('is stable when face names are stable even if edge hashes change', () => {
        const faceMap: ElementMap = new Map([[10, 'A'], [11, 'B']]);
        // Same faces, different edge hash after a regen — name is unchanged.
        const before = buildEdgeMap(new Map([[100, [10, 11]]]), faceMap);
        const after = buildEdgeMap(new Map([[999, [10, 11]]]), faceMap);
        expect(before.get(100)).toBe(after.get(999));
    });

    it('skips edges whose faces have no names', () => {
        const faceMap: ElementMap = new Map([[10, 'A']]);
        const edgeMap = buildEdgeMap(new Map([[100, [20, 21]]]), faceMap);
        expect(edgeMap.size).toBe(0);
    });

    it('leaves a unique face-pair name bare (no rank suffix)', () => {
        const faceMap: ElementMap = new Map([[10, 'A'], [11, 'B']]);
        const edgeMap = buildEdgeMap(new Map([[100, [10, 11]]]), faceMap);
        expect(edgeMap.get(100)).toBe('E[A~B]');
    });

    it('disambiguates two edges sharing a face pair by geometry (the hole-rim bug)', () => {
        // A hole through a sphere: both rims border {sphere=A, cylinder=B}.
        const faceMap: ElementMap = new Map([[10, 'A'], [11, 'B']]);
        const adjacency = new Map<number, number[]>([
            [100, [10, 11]], // bottom rim
            [101, [10, 11]], // top rim
        ]);
        const geom = new Map([
            [100, { center: [0, 0, -5] as [number, number, number], length: 6.28 }],
            [101, { center: [0, 0, 5] as [number, number, number], length: 6.28 }],
        ]);
        const edgeMap = buildEdgeMap(adjacency, faceMap, geom);

        // Distinct names — the core fix.
        expect(edgeMap.get(100)).not.toBe(edgeMap.get(101));
        // Ranked by ascending z: bottom rim @0, top rim @1.
        expect(edgeMap.get(100)).toBe('E[A~B]@0');
        expect(edgeMap.get(101)).toBe('E[A~B]@1');
    });

    it('assigns the same rank regardless of adjacency iteration order (stable)', () => {
        const faceMap: ElementMap = new Map([[10, 'A'], [11, 'B']]);
        const geom = new Map([
            [100, { center: [0, 0, -5] as [number, number, number], length: 6.28 }],
            [101, { center: [0, 0, 5] as [number, number, number], length: 6.28 }],
        ]);
        // Insert edges in the opposite order — the top rim still ends up @1.
        const edgeMap = buildEdgeMap(
            new Map([[101, [10, 11]], [100, [10, 11]]]),
            faceMap,
            geom,
        );
        expect(edgeMap.get(100)).toBe('E[A~B]@0');
        expect(edgeMap.get(101)).toBe('E[A~B]@1');
    });
});

describe('composeElementMap', () => {
    it('keeps the name of an unchanged (passthrough) face', () => {
        // Input face 100 named "A"; it appears unchanged in the output.
        const input: ElementMap = new Map([[100, 'A']]);
        const out = composeElementMap(input, history({}), [100], 'fuse');
        expect(out.get(100)).toBe('A');
    });

    it('carries a name across a 1:1 modification', () => {
        // Input face 100 ("A") was modified into output face 200.
        const input: ElementMap = new Map([[100, 'A']]);
        const h = history({ modified: new Map([[100, [200]]]) });
        const out = composeElementMap(input, h, [200], 'fuse');
        expect(out.get(200)).toBe('A');
    });

    it('disambiguates a 1:many split with a stable suffix', () => {
        const input: ElementMap = new Map([[100, 'A']]);
        const h = history({ modified: new Map([[100, [200, 201]]]) });
        const out = composeElementMap(input, h, [200, 201], 'fuse');
        expect(out.get(200)).toBe('A|0');
        expect(out.get(201)).toBe('A|1');
    });

    it('tags generated faces distinctly from their source', () => {
        const input: ElementMap = new Map([[100, 'A']]);
        const h = history({ generated: new Map([[100, [300]]]) });
        const out = composeElementMap(input, h, [300], 'fuse');
        expect(out.get(300)).toBe('A+g0');
    });

    it('mints fresh names for genuinely new faces with no history', () => {
        // Output face 999 corresponds to no input and no history entry.
        const out = composeElementMap(new Map(), history({}), [999], 'cut');
        expect(out.get(999)).toBe('cut$N0');
    });

    it('merges two inputs and names every output face', () => {
        // Box A faces 10,11,12 (a,b,c); Box B faces 20,21 (d,e).
        const input: ElementMap = new Map([
            [10, 'shape1#F0'], [11, 'shape1#F1'], [12, 'shape1#F2'],
            [20, 'shape2#F0'], [21, 'shape2#F1'],
        ]);
        // Fuse: A#F0 deformed → 30; B#F0 deformed → 31; A#F1, B#F1 pass through; one new weld face 40.
        const h = history({
            modified: new Map([[10, [30]], [20, [31]]]),
        });
        const outputFaces = [30, 31, 11, 21, 40];
        const out = composeElementMap(input, h, outputFaces, 'fuse');

        expect(out.get(30)).toBe('shape1#F0'); // modified, name preserved
        expect(out.get(31)).toBe('shape2#F0');
        expect(out.get(11)).toBe('shape1#F1'); // passthrough
        expect(out.get(21)).toBe('shape2#F1');
        expect(out.get(40)).toBe('fuse$N0');   // genuinely new
        expect(out.size).toBe(5);
    });

    it('is deterministic: same inputs → identical names (the whole point)', () => {
        const input: ElementMap = new Map([[10, 'shape1#F0'], [11, 'shape1#F1']]);
        const h = history({ modified: new Map([[10, [30, 31]]]) });
        const faces = [30, 31, 11];

        const a = composeElementMap(input, h, faces, 'fuse');
        const b = composeElementMap(input, h, faces, 'fuse');
        expect([...a.entries()]).toEqual([...b.entries()]);
    });

    it('contains exactly the result faces — no phantom entries from dropped intermediates', () => {
        // History references output hashes 200,201,202 but SimplifyResult left
        // only 200 in the actual result. The map must not keep 201/202.
        const input: ElementMap = new Map([[100, 'A']]);
        const h = history({
            modified: new Map([[100, [200, 201]]]),
            generated: new Map([[100, [202]]]),
        });
        const out = composeElementMap(input, h, [200], 'fuse');
        expect(out.size).toBe(1);
        expect(out.has(201)).toBe(false);
        expect(out.has(202)).toBe(false);
        expect(out.get(200)).toBe('A|0'); // 200 was a modified (split) face
    });

    it('drops names for deleted input faces (they simply never appear in output)', () => {
        const input: ElementMap = new Map([[10, 'A'], [11, 'B']]);
        // Face 11 deleted; only face 10 survives, unchanged.
        const h = history({ deleted: new Set([11]) });
        const out = composeElementMap(input, h, [10], 'cut');
        expect(out.get(10)).toBe('A');
        expect(out.has(11)).toBe(false);
        expect(out.size).toBe(1);
    });
});

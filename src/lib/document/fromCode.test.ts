import { describe, it, expect } from 'vitest';
import { parseDocument } from './fromCode';

const main = (body: string) => `const main = () => {\n${body}\n  return [];\n};`;

describe('parseDocument — primitives', () => {
    it('types a box with its dimensions', () => {
        const doc = parseDocument(main('  const shape1 = makeBaseBox(10, 20, 30);'));
        const box = doc.getObject('shape1')!;
        expect(box.type).toBe('box');
        expect(box.properties.width).toEqual({ kind: 'length', value: 10, unit: 'mm' });
        expect(box.properties.depth).toEqual({ kind: 'length', value: 20, unit: 'mm' });
        expect(box.properties.height).toEqual({ kind: 'length', value: 30, unit: 'mm' });
    });

    it('types cylinder and sphere', () => {
        const doc = parseDocument(main(
            '  const shape1 = makeCylinder(3, 8);\n' +
            '  const shape2 = makeSphere(4);',
        ));
        expect(doc.getObject('shape1')!.type).toBe('cylinder');
        expect(doc.getObject('shape2')!.type).toBe('sphere');
        expect(doc.getObject('shape1')!.properties.radius).toEqual({ kind: 'length', value: 3, unit: 'mm' });
    });
});

describe('parseDocument — booleans (which the old guesser mislabelled as "box")', () => {
    it('types a fuse and links its operands', () => {
        const doc = parseDocument(main(
            '  const shape1 = makeBaseBox(1, 1, 1);\n' +
            '  const shape2 = makeBaseBox(1, 1, 1);\n' +
            '  const shape3 = shape1.fuse(shape2);',
        ));
        const fuse = doc.getObject('shape3')!;
        expect(fuse.type).toBe('fuse');
        // dependencies derived from the operand links
        expect(doc.dependencies('shape3').sort()).toEqual(['shape1', 'shape2']);
    });

    it('types cut and intersect', () => {
        const doc = parseDocument(main(
            '  const a = makeBaseBox(1, 1, 1);\n' +
            '  const b = makeBaseBox(1, 1, 1);\n' +
            '  const c = a.cut(b);\n' +
            '  const d = a.intersect(b);',
        ));
        expect(doc.getObject('c')!.type).toBe('cut');
        expect(doc.getObject('d')!.type).toBe('intersect');
    });
});

describe('parseDocument — feature ops', () => {
    it('types a fillet, links the base, and records edge names + radius', () => {
        const doc = parseDocument(main(
            '  const shape1 = makeBaseBox(10, 10, 10);\n' +
            '  const shape2 = __fillet(shape1, ["E[shape1#F0~shape1#F1]"], 2);',
        ));
        const fillet = doc.getObject('shape2')!;
        expect(fillet.type).toBe('fillet');
        expect(fillet.properties.radius).toEqual({ kind: 'length', value: 2, unit: 'mm' });
        expect(fillet.properties.base).toEqual({
            kind: 'linkSub',
            links: [{ objectId: 'shape1', subElements: ['E[shape1#F0~shape1#F1]'] }],
        });
        expect(doc.dependencies('shape2')).toEqual(['shape1']);
    });

    it('types shell with a thickness and chamfer with a distance', () => {
        const doc = parseDocument(main(
            '  const shape1 = makeBaseBox(10, 10, 10);\n' +
            '  const shape2 = __shell(shape1, ["shape1#F0"], 1.5);\n' +
            '  const shape3 = __chamfer(shape1, ["E[shape1#F0~shape1#F1]"], 0.5);',
        ));
        expect(doc.getObject('shape2')!.type).toBe('shell');
        expect(doc.getObject('shape2')!.properties.thickness).toEqual({ kind: 'length', value: 1.5, unit: 'mm' });
        expect(doc.getObject('shape3')!.type).toBe('chamfer');
        expect(doc.getObject('shape3')!.properties.distance).toEqual({ kind: 'length', value: 0.5, unit: 'mm' });
    });
});

describe('parseDocument — recompute order reflects the feature graph', () => {
    it('orders base before fillet', () => {
        const doc = parseDocument(main(
            '  const shape1 = makeBaseBox(10, 10, 10);\n' +
            '  const shape2 = __fillet(shape1, ["E[a~b]"], 2);',
        ));
        const order = doc.recomputeOrder();
        expect(order.indexOf('shape1')).toBeLessThan(order.indexOf('shape2'));
    });
});

describe('parseDocument — fallback', () => {
    it('makes an unrecognised feature an opaque script node instead of guessing', () => {
        const doc = parseDocument(main('  const weird = someUnknownThing(1, 2, 3);'));
        expect(doc.getObject('weird')!.type).toBe('script');
    });
});

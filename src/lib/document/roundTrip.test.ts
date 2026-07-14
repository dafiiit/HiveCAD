import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import { parseDocument } from './fromCode';
import { generateCode, tipObjects, exprFor } from './toCode';
import type { DocumentObject } from './types';

const main = (body: string) => `const main = () => {\n${body}\n  return [];\n};`;

/** Compare the salient shape of two documents (ids + types + key props). */
function summarize(code: string) {
    const doc = parseDocument(code);
    return doc.all().map(o => ({ id: o.id, type: o.type, props: JSON.stringify(o.properties) }));
}

describe('generateCode → valid, parseable script', () => {
    it('emits a syntactically valid main()', () => {
        const doc = parseDocument(main('  const shape1 = makeBaseBox(10, 20, 30);'));
        const code = generateCode(doc);
        expect(() => parse(code, { sourceType: 'module' })).not.toThrow();
        expect(code).toContain('const shape1 = replicad.makeBaseBox(10, 20, 30)');
    });

    it('emits primitives as replicad.* calls so they resolve in the worker', () => {
        // Execution-faithfulness: the worker has `replicad` in scope, not bare
        // `makeBaseBox`/`makeCylinder`/`makeSphere`.
        const doc = parseDocument(main(
            '  const a = makeBaseBox(1, 1, 1);\n' +
            '  const b = makeCylinder(2, 3);\n' +
            '  const c = makeSphere(4);',
        ));
        const code = generateCode(doc);
        expect(code).toContain('replicad.makeBaseBox(1, 1, 1)');
        expect(code).toContain('replicad.makeCylinder(2, 3)');
        expect(code).toContain('replicad.makeSphere(4)');
        expect(code).not.toMatch(/=\s*makeBaseBox\(/); // never bare
    });
});

describe('round-trip: code → doc → code → doc preserves the model', () => {
    const cases: Record<string, string> = {
        box: '  const shape1 = makeBaseBox(10, 20, 30);',
        cylinder: '  const shape1 = makeCylinder(3, 8);',
        boolean:
            '  const shape1 = makeBaseBox(1, 1, 1);\n' +
            '  const shape2 = makeBaseBox(2, 2, 2);\n' +
            '  const shape3 = shape1.fuse(shape2);',
        fillet:
            '  const shape1 = makeBaseBox(10, 10, 10);\n' +
            '  const shape2 = __fillet(shape1, ["E[shape1#F0~shape1#F1]"], 2);',
        shell:
            '  const shape1 = makeBaseBox(10, 10, 10);\n' +
            '  const shape2 = __shell(shape1, ["shape1#F0"], 1.5);',
    };

    for (const [name, body] of Object.entries(cases)) {
        it(`is stable for ${name}`, () => {
            const original = summarize(main(body));
            const regenerated = summarize(generateCode(parseDocument(main(body))));
            expect(regenerated).toEqual(original);
        });
    }

    it('preserves an unmodelled feature verbatim through the round-trip', () => {
        const code = main('  const gear = customGear({ teeth: 20, module: 2 });');
        const doc = parseDocument(code);
        expect(doc.getObject('gear')!.type).toBe('script');
        const regen = generateCode(doc);
        expect(regen).toContain('customGear({');
        // and it survives a second parse as a script node again
        expect(parseDocument(regen).getObject('gear')!.type).toBe('script');
    });
});

describe('tipObjects — what main() returns', () => {
    it('returns a standalone body', () => {
        const doc = parseDocument(main('  const shape1 = makeBaseBox(1, 1, 1);'));
        expect(tipObjects(doc)).toEqual(['shape1']);
    });

    it('returns only the result, not the consumed operands', () => {
        const doc = parseDocument(main(
            '  const shape1 = makeBaseBox(1, 1, 1);\n' +
            '  const shape2 = makeBaseBox(1, 1, 1);\n' +
            '  const shape3 = shape1.fuse(shape2);',
        ));
        expect(tipObjects(doc)).toEqual(['shape3']);
    });

    it('does not return a body consumed by a fillet', () => {
        const doc = parseDocument(main(
            '  const shape1 = makeBaseBox(10, 10, 10);\n' +
            '  const shape2 = __fillet(shape1, ["E[a~b]"], 2);',
        ));
        expect(tipObjects(doc)).toEqual(['shape2']);
    });
});

describe('exprFor — edit a property, regenerate', () => {
    it('reflects an edited box dimension in the generated call', () => {
        const doc = parseDocument(main('  const shape1 = makeBaseBox(10, 10, 10);'));
        const box = doc.getObject('shape1') as DocumentObject;
        box.properties.width = { kind: 'length', value: 99, unit: 'mm' };
        expect(exprFor(box)).toBe('replicad.makeBaseBox(99, 10, 10)');
    });
});

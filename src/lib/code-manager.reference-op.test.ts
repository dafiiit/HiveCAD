import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import { CodeManager } from './code-manager';

/**
 * Guards `applyReferenceOp` — the codegen for fillet/chamfer/shell, which
 * reference edges/faces by stable MappedName.
 */
describe('applyReferenceOp', () => {
    const oneBody = [
        'const main = () => {',
        '  const shape1 = makeBaseBox(10, 10, 10);',
        '  return [shape1];',
        '};',
    ].join('\n');

    it('generates a __fillet call referencing the base and edge names', () => {
        const cm = new CodeManager(oneBody);
        const id = cm.applyReferenceOp('__fillet', 'shape1', ['E[shape1#F0~shape1#F1]'], 2);
        expect(id).toBeTruthy();
        expect(cm.getCode()).toContain(`const ${id} = __fillet(shape1, ["E[shape1#F0~shape1#F1]"], 2)`);
    });

    it('keeps the base declaration and returns only the result', () => {
        const cm = new CodeManager(oneBody);
        const id = cm.applyReferenceOp('__shell', 'shape1', ['shape1#F0'], 1.5)!;
        const code = cm.getCode();
        expect(code).toMatch(/const shape1 = makeBaseBox/); // base kept
        const returnLine = code.split('\n').find(l => l.includes('return'))!;
        expect(returnLine).toContain(id);
        expect(returnLine).not.toMatch(/\bshape1\b/); // base consumed from return
    });

    it('strips a sub-entity suffix from the base id', () => {
        const cm = new CodeManager(oneBody);
        const id = cm.applyReferenceOp('__fillet', 'shape1:edge-3', ['E[A~B]'], 1);
        expect(cm.getCode()).toContain(`const ${id} = __fillet(shape1, ["E[A~B]"], 1)`);
    });

    it('emits multiple edge names as an array', () => {
        const cm = new CodeManager(oneBody);
        const id = cm.applyReferenceOp('__chamfer', 'shape1', ['E[A~B]', 'E[C~D]'], 0.5);
        expect(cm.getCode()).toContain(`const ${id} = __chamfer(shape1, ["E[A~B]", "E[C~D]"], 0.5)`);
    });

    it('returns undefined with no reference names', () => {
        const cm = new CodeManager(oneBody);
        expect(cm.applyReferenceOp('__fillet', 'shape1', [], 2)).toBeUndefined();
    });

    it('produces syntactically valid code', () => {
        const cm = new CodeManager(oneBody);
        cm.applyReferenceOp('__fillet', 'shape1', ['E[shape1#F0~shape1#F1]'], 2);
        expect(() => parse(cm.getCode(), { sourceType: 'module' })).not.toThrow();
    });
});

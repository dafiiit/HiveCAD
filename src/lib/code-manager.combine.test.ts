import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import { CodeManager } from './code-manager';

/**
 * Guards `combineFeatures` — the boolean-combine primitive. The bug it replaces
 * appended `.fuse(secondary)` to the primary and then DELETED the secondary's
 * declaration, producing `secondary is not defined` at runtime.
 */
describe('combineFeatures', () => {
    const twoSolids = [
        'const main = () => {',
        '  const shape1 = makeBaseBox(10, 10, 10);',
        '  const shape2 = makeBaseBox(5, 5, 5);',
        '  return [shape1, shape2];',
        '};',
    ].join('\n');

    it('creates a result feature referencing both operands', () => {
        const cm = new CodeManager(twoSolids);
        const resultId = cm.combineFeatures('fuse', 'shape1', ['shape2']);

        expect(resultId).toBeTruthy();
        expect(cm.getCode()).toContain(`const ${resultId} = shape1.fuse(shape2)`);
    });

    it('keeps operand declarations so the references resolve (no dangling ref)', () => {
        const cm = new CodeManager(twoSolids);
        cm.combineFeatures('fuse', 'shape1', ['shape2']);
        const code = cm.getCode();

        // Both operands are still declared.
        expect(code).toMatch(/const shape1 = makeBaseBox/);
        expect(code).toMatch(/const shape2 = makeBaseBox/);
    });

    it('returns only the result, not the consumed operands', () => {
        const cm = new CodeManager(twoSolids);
        const resultId = cm.combineFeatures('fuse', 'shape1', ['shape2']);
        const code = cm.getCode();

        // The return array lists the result and neither operand.
        const returnLine = code.split('\n').find(l => l.includes('return'))!;
        expect(returnLine).toContain(resultId!);
        expect(returnLine).not.toMatch(/\bshape1\b/);
        expect(returnLine).not.toMatch(/\bshape2\b/);
    });

    it('chains multiple secondaries in order', () => {
        const code = [
            'const main = () => {',
            '  const shape1 = makeBaseBox(1, 1, 1);',
            '  const shape2 = makeBaseBox(1, 1, 1);',
            '  const shape3 = makeBaseBox(1, 1, 1);',
            '  return [shape1, shape2, shape3];',
            '};',
        ].join('\n');
        const cm = new CodeManager(code);
        const resultId = cm.combineFeatures('fuse', 'shape1', ['shape2', 'shape3']);

        expect(cm.getCode()).toContain(`const ${resultId} = shape1.fuse(shape2).fuse(shape3)`);
    });

    it('works for cut and intersect too', () => {
        const cut = new CodeManager(twoSolids);
        const cutId = cut.combineFeatures('cut', 'shape1', ['shape2']);
        expect(cut.getCode()).toContain(`const ${cutId} = shape1.cut(shape2)`);

        const isect = new CodeManager(twoSolids);
        const isectId = isect.combineFeatures('intersect', 'shape1', ['shape2']);
        expect(isect.getCode()).toContain(`const ${isectId} = shape1.intersect(shape2)`);
    });

    it('produces syntactically valid code', () => {
        const cm = new CodeManager(twoSolids);
        cm.combineFeatures('fuse', 'shape1', ['shape2']);
        expect(() => parse(cm.getCode(), { sourceType: 'module' })).not.toThrow();
    });

    it('every returned identifier is still declared (no dangling reference)', () => {
        const cm = new CodeManager(twoSolids);
        const resultId = cm.combineFeatures('fuse', 'shape1', ['shape2'])!;
        const code = cm.getCode();
        // The one returned id must have a declaration.
        expect(code).toMatch(new RegExp(`const ${resultId} =`));
    });

    it('keepTools keeps the operands in the return array', () => {
        const cm = new CodeManager(twoSolids);
        const resultId = cm.combineFeatures('fuse', 'shape1', ['shape2'], { keepTools: true });
        const returnLine = cm.getCode().split('\n').find(l => l.includes('return'))!;
        expect(returnLine).toContain('shape1');
        expect(returnLine).toContain('shape2');
        expect(returnLine).toContain(resultId!);
    });

    it('strips sub-entity suffixes from operand ids (shape2:face-0 → shape2)', () => {
        const cm = new CodeManager(twoSolids);
        // Face selections must not leak into the generated identifier.
        const resultId = cm.combineFeatures('fuse', 'shape1:face-0', ['shape2:face-3']);
        const code = cm.getCode();
        expect(code).toContain(`const ${resultId} = shape1.fuse(shape2)`);
        expect(code).not.toContain(':face-');
        expect(() => parse(code, { sourceType: 'module' })).not.toThrow();
    });

    it('returns undefined when operands collapse to a single distinct body', () => {
        const cm = new CodeManager(twoSolids);
        // Same solid picked twice (e.g. two faces of shape1) → nothing to combine.
        expect(cm.combineFeatures('fuse', 'shape1:face-0', ['shape1:face-2'])).toBeUndefined();
    });
});

import { describe, it, expect } from 'vitest';
import { isFlatFeatureProgram } from './fromCode';
import { deriveFromToolCode, deriveFromCodeEdit } from './sync';

const flatBox = 'const main = () => {\n  const shape1 = makeBaseBox(10, 10, 10);\n  return [shape1];\n};';

const gridfinityish = [
    'const SIZE = 42;',
    'const helper = (x) => x * 2;',
    'function main(r, { n = 3 } = {}) {',
    '  let box = makeBaseBox(SIZE, SIZE, 10);',
    '  for (let i = 0; i < n; i++) { box = box.fuse(makeCylinder(2, 5)); }',
    '  return box;',
    '}',
].join('\n');

const importish = [
    'const main = () => {',
    '  const raw = "AAAA";',
    '  const bytes = new Uint8Array(raw.length);',
    '  for (let i = 0; i < raw.length; i++) { bytes[i] = raw.charCodeAt(i); }',
    '  return [];',
    '};',
].join('\n');

describe('isFlatFeatureProgram', () => {
    it('accepts a flat feature program', () => {
        expect(isFlatFeatureProgram(flatBox)).toBe(true);
        expect(isFlatFeatureProgram('const main = () => {\n  return;\n};')).toBe(true);
    });

    it('rejects imperative Gridfinity-class code', () => {
        expect(isFlatFeatureProgram(gridfinityish)).toBe(false);
    });

    it('rejects code with module-scope helpers', () => {
        expect(isFlatFeatureProgram('const H = 5;\nconst main = () => { return []; };')).toBe(false);
    });

    it('rejects a main with a loop (e.g. a base64 import)', () => {
        expect(isFlatFeatureProgram(importish)).toBe(false);
    });

    it('rejects reassignment / let in main', () => {
        expect(isFlatFeatureProgram('const main = () => {\n  let a = makeSphere(1);\n  a = a.fuse(a);\n  return [a];\n};')).toBe(false);
    });
});

describe('deriveFromToolCode — the flip, gated', () => {
    it('adopts the document as truth for flat code and normalises the code', () => {
        const s = deriveFromToolCode('const main = () => {\n  const shape1 = makeBaseBox(10, 20, 30);\n  return [shape1];\n};');
        expect(s.document).not.toBeNull();
        expect(s.document!.getObject('shape1')!.type).toBe('box');
        expect(s.code).toContain('makeBaseBox(10, 20, 30)');
    });

    it('does NOT touch imperative code — stays code-as-truth (Gridfinity is safe)', () => {
        const s = deriveFromToolCode(gridfinityish);
        expect(s.document).toBeNull();
        expect(s.code).toBe(gridfinityish); // preserved byte-for-byte
    });
});

describe('deriveFromCodeEdit — code-first escape hatch preserves text', () => {
    it('keeps the user code verbatim but derives a document when flat', () => {
        const withComment = 'const main = () => {\n  // my box\n  const shape1 = makeBaseBox(1, 1, 1);\n  return [shape1];\n};';
        const s = deriveFromCodeEdit(withComment);
        expect(s.code).toBe(withComment);              // comment preserved
        expect(s.document!.getObject('shape1')!.type).toBe('box');
    });

    it('leaves document null for imperative code', () => {
        const s = deriveFromCodeEdit(gridfinityish);
        expect(s.code).toBe(gridfinityish);
        expect(s.document).toBeNull();
    });
});

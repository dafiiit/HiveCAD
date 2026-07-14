import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import { CodeManager } from './code-manager';

/**
 * Guards `transformForIncremental` — the lazy-memoization transform that powers
 * Stage 1 incremental regeneration. The critical invariants are that feature
 * expressions become lazy thunks (so clean features can be skipped) and that no
 * `await` ever lands at module scope (which would be a syntax error the worker
 * only discovers at `new Function` time).
 */
describe('transformForIncremental', () => {
    const arrowMain = (body: string) => `const main = () => {\n${body}\n};`;

    it('wraps a main-body feature as a lazy memoized thunk', () => {
        const cm = new CodeManager(arrowMain('  const shape1 = makeBaseBox(10, 10, 10);\n  return [shape1];'));
        const out = cm.transformForIncremental();

        expect(out).toContain('__memo("shape1"');
        // Lazy: the constructor is inside an arrow, not evaluated eagerly.
        expect(out).toMatch(/__memo\("shape1",\s*async\s*\(\)\s*=>/);
        // Awaited at the call site.
        expect(out).toContain('await __memo("shape1"');
    });

    it('forces main async so the injected awaits are legal', () => {
        const cm = new CodeManager(arrowMain('  const shape1 = makeBaseBox(1, 1, 1);\n  return [shape1];'));
        const out = cm.transformForIncremental();
        expect(out).toMatch(/main\s*=\s*async\s*\(\)\s*=>/);
    });

    it('handles the function-declaration form of main', () => {
        const cm = new CodeManager('function main() {\n  const shape1 = makeBaseBox(1, 1, 1);\n  return [shape1];\n}');
        const out = cm.transformForIncremental();
        expect(out).toMatch(/async\s+function\s+main/);
        expect(out).toContain('await __memo("shape1"');
    });

    it('does NOT wrap module-scope declarations (await would be illegal there)', () => {
        const code = `const helper = 5;\n${arrowMain('  const shape1 = makeBaseBox(helper, 1, 1);\n  return [shape1];')}`;
        const cm = new CodeManager(code);
        const out = cm.transformForIncremental();

        // The module-level `helper` stays a plain declaration.
        expect(out).toMatch(/const helper = 5;/);
        expect(out).not.toContain('__memo("helper"');
    });

    it('produces syntactically valid module code (no floating await)', () => {
        const code = `const helper = 5;\n${arrowMain('  const shape1 = makeBaseBox(1, 1, 1);\n  const shape2 = shape1.fillet(1);\n  return [shape2];')}`;
        const out = new CodeManager(code).transformForIncremental();

        // If any await leaked to module scope this throws.
        expect(() => parse(out, { sourceType: 'module' })).not.toThrow();
    });

    it('memoizes every feature in a multi-feature main', () => {
        const cm = new CodeManager(arrowMain(
            '  const shape1 = makeBaseBox(1, 1, 1);\n' +
            '  const shape2 = makeCylinder(1, 2);\n' +
            '  const shape3 = shape1.fuse(shape2);\n' +
            '  return [shape3];'
        ));
        const out = cm.transformForIncremental();
        expect(out).toContain('__memo("shape1"');
        expect(out).toContain('__memo("shape2"');
        expect(out).toContain('__memo("shape3"');
    });

    it('is a no-op on empty default code', () => {
        const cm = new CodeManager('const main = () => {\n  return;\n};');
        const out = cm.transformForIncremental();
        expect(out).not.toContain('__memo');
        // still valid
        expect(() => parse(out, { sourceType: 'module' })).not.toThrow();
    });
});

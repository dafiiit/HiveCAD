
import { describe, it, expect } from 'vitest';
import { CodeManager } from '../lib/code-manager';

describe('CodeManager', () => {
    it('should parse simple replicad code with variables', () => {
        const code = `
        const box = replicad.makeBox(10, 20, 30);
    `;
        const manager = new CodeManager(code);
        expect(manager.ast).toBeDefined();
        // Start with 1 feature found (box)
        expect(manager.features.length).toBeGreaterThan(0);
        expect(manager.features[0].id).toBe('box');
    });

    it('should transform code for execution', () => {
        const code = `const box = replicad.makeBox(10, 10, 10);`;
        const manager = new CodeManager(code);
        const transformed = manager.transformForExecution();
        expect(transformed).toContain('__record');
        expect(transformed).toContain('const box =');
    });

    it('should update operations', () => {
        const code = `const box = replicad.makeBox(10, 20, 30)`;
        const manager = new CodeManager(code);

        // Find the feature ID
        expect(manager.features.length).toBeGreaterThan(0);
        const featureId = manager.features[0].id; // 'box'

        manager.updateOperation(featureId, 0, [99, 20, 30]);

        expect(manager.code).toContain('replicad.makeBox(99, 20, 30)');
    });

    it('should add operations to a chain', () => {
        const code = `const shape = replicad.draw();`;
        const manager = new CodeManager(code);

        expect(manager.features.length).toBeGreaterThan(0);
        const featureId = manager.features[0].id;

        manager.addOperation(featureId, 'line', [10, 20]);

        expect(manager.code).toContain('replicad.draw().line(10, 20)');

        manager.addOperation(featureId, 'close', []);
        expect(manager.code).toContain('.line(10, 20).close()');
    });

    it('should add operations with predicate arguments', () => {
        const code = `const shape = replicad.makeBox(10, 10, 10);`;
        const manager = new CodeManager(code);
        const featureId = manager.features[0].id;

        const predicate = { type: 'raw', content: '(e) => e.inPlane("XY")' };
        manager.addOperation(featureId, 'fillet', [2, predicate]);

        expect(manager.code).toMatch(/fillet\(2, \(?e\)? => e\.inPlane\(['"]XY['"]\)\)/);
    });
    it('should add operations with array arguments', () => {
        const code = `const shape = replicad.draw();`;
        const manager = new CodeManager(code);
        const featureId = manager.features[0].id;

        manager.addOperation(featureId, 'lineTo', [[10, 20]]);

        expect(manager.code).toContain('.lineTo([10, 20])');
    });
});


import { describe, it, expect } from 'vitest';
import { CodeManager } from '../lib/code-manager';

describe('CodeManager', () => {
    it('should parse simple replicad code', () => {
        const code = `
      const main = () => {
        let shapes = [];
        shapes.push(replicad.makeBox(10, 20, 30));
        return shapes;
      };
    `;
        const manager = new CodeManager(code);
        expect(manager.ast).toBeDefined();
        // Start with 1 node found (makeBox)
        expect(manager.nodeMap.size).toBeGreaterThan(0);
    });

    it('should transform code for execution', () => {
        const code = `replicad.makeBox(10, 10, 10)`;
        const manager = new CodeManager(code);
        const transformed = manager.transformForExecution();
        expect(transformed).toContain('__record');
        expect(transformed).toContain('replicad.makeBox(10, 10, 10)');
    });

    it('should update arguments', () => {
        const code = `replicad.makeBox(10, 20, 30)`;
        const manager = new CodeManager(code);

        // Find the node UUID
        const [uuid] = manager.nodeMap.keys();

        manager.updateArgument(uuid, 0, 99);

        expect(manager.code).toContain('replicad.makeBox(99, 20, 30)');
    });
});

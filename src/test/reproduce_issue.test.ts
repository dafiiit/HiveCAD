
import { describe, it, expect } from 'vitest';
import { CodeManager } from '../lib/code-manager';

describe('CodeManager - Complex Chaining and Binding', () => {
    it('should correctly parse a complex sketch chain', () => {
        const code = `
            const sketch = replicad.draw()
                .line(10, 0)
                .line(0, 10)
                .arc(5, 5)
                .close();
        `;
        const manager = new CodeManager(code);

        expect(manager.features.length).toBe(1);
        const feature = manager.features[0];
        expect(feature.id).toBe('sketch');

        // Expected operations: [draw, line, line, arc, close] (or similar, depending on how draw is handled)
        // Current implementation might reverse them or miss some if not robust
        const opNames = feature.operations.map(op => op.name);
        expect(opNames).toEqual(['draw', 'line', 'line', 'arc', 'close']);

        // Verify codeRange exists
        feature.operations.forEach(op => {
            expect(op.codeRange).toBeDefined();
            expect(op.codeRange.start.line).toBeGreaterThan(0);
        });
    });

    it('should track variable usage in subsequent operations', () => {
        const code = `
            const profile = replicad.drawRectangle(10, 20);
            const box = profile.sketchOnPlane('XY').extrude(5);
        `;
        const manager = new CodeManager(code);

        expect(manager.features.length).toBe(2);

        const profile = manager.features.find(f => f.id === 'profile');
        const box = manager.features.find(f => f.id === 'box');

        expect(profile).toBeDefined();
        expect(box).toBeDefined();

        // Box source should ideally point to 'profile' or track back to it
        expect(box?.source).toBe('profile');

        // Check if operations are correctly mapped for 'box'
        const boxOps = box?.operations.map(op => op.name);
        expect(boxOps).toEqual(['sketchOnPlane', 'extrude']);
    });

    it('should handle nested variable dependencies', () => {
        const code = `
            const w = 10;
            const h = 20;
            const sketch = replicad.drawRectangle(w, h);
            const body = sketch.extrude(10);
        `;
        const manager = new CodeManager(code);
        const sketch = manager.features.find(f => f.id === 'sketch');

        // We might want to see if it captures the arguments as variable references
        // simpler check for now: just ensuring it parses
        expect(sketch).toBeDefined();
        expect(sketch?.operations[0].name).toBe('drawRectangle');
    });
});

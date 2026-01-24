
import { describe, it, expect } from 'vitest';
import { CodeManager } from '../lib/code-manager';
import * as t from '@babel/types';

describe('Manual Reproduction of Sketch to Extrusion', () => {
    it('should correctly build the chain step by step', () => {
        const initialCode = `const main = () => {\n  return [];\n};`;
        const cm = new CodeManager(initialCode);

        // 1. Finish Sketch (Circle)
        // Simulate finishSketch logic
        const sketchName = cm.addFeature('drawCircle', null, [10]);
        cm.addOperation(sketchName, 'translate', [5, 5]);
        cm.addOperation(sketchName, 'sketchOnPlane', ['XY']);

        console.log('After Sketch:', cm.getCode());
        expect(cm.getCode()).toContain('const shape1 = replicad.drawCircle(10).translate(5, 5).sketchOnPlane("XY");');

        // 2. Extrude
        // Simulate addObject('extrusion')
        cm.addOperation(sketchName, 'extrude', [20]);

        console.log('After Extrude:', cm.getCode());
        // IT SHOULD BE:
        // const shape1 = replicad.drawCircle(10).translate(5, 5).sketchOnPlane("XY").extrude(20);
        // OR similar.
        expect(cm.getCode()).toContain('.sketchOnPlane("XY").extrude(20)');
    });
});

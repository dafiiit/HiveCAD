import type { Tool } from '../types';
import type { CodeManager } from '../../code-manager';

export const coilTool: Tool = {
    metadata: {
        id: 'coil',
        label: 'Coil',
        icon: 'Triangle',
        category: 'primitive',
        description: 'Create a coil/helix shape'
    },
    uiProperties: [
        { key: 'radius', label: 'Radius', type: 'number', default: 5, unit: 'mm', min: 0.1, step: 0.5 },
        { key: 'height', label: 'Height', type: 'number', default: 20, unit: 'mm', min: 0.1, step: 0.5 },
        { key: 'turns', label: 'Turns', type: 'number', default: 5, min: 0.5, step: 0.5 },
        { key: 'tubeRadius', label: 'Tube Radius', type: 'number', default: 1, unit: 'mm', min: 0.1, step: 0.1 }
    ],
    create(codeManager: CodeManager, params: Record<string, any>): string {
        const { radius = 5, height = 20, turns = 5, tubeRadius = 1 } = params;
        // Coil via twisted extrusion: drawCircle(tubeRadius).translate(radius, 0).sketchOnPlane("XY").extrude(height, {twistAngle: 360*turns})
        const sketchName = codeManager.addFeature('drawCircle', null, [tubeRadius]);
        codeManager.addOperation(sketchName, 'translate', [radius, 0]);
        codeManager.addOperation(sketchName, 'sketchOnPlane', ["XY"]);
        codeManager.addOperation(sketchName, 'extrude', [height, { twistAngle: 360 * turns }]);
        return sketchName;
    }
};

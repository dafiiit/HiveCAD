import type { Tool, ToolContext } from '../../../types';

export const coilTool: Tool = {
    metadata: {
        id: 'coil',
        label: 'Coil',
        icon: 'Shell',
        category: 'primitive',
        description: 'Create a coil/helix shape'
    },
    uiProperties: [
        { key: 'radius', label: 'Radius', type: 'number', default: 5, unit: 'mm', min: 0.1, step: 0.5 },
        { key: 'height', label: 'Height', type: 'number', default: 20, unit: 'mm', min: 0.1, step: 0.5 },
        { key: 'turns', label: 'Turns', type: 'number', default: 5, min: 0.5, step: 0.5 },
        { key: 'tubeRadius', label: 'Tube Radius', type: 'number', default: 1, unit: 'mm', min: 0.1, step: 0.1 }
    ],
    create(context: ToolContext): string {
        const { radius = 5, height = 20, turns = 5, tubeRadius = 1 } = context.params;
        // Coil via twisted extrusion
        const sketchName = context.codeManager.addFeature('drawCircle', null, [tubeRadius]);
        context.codeManager.addOperation(sketchName, 'translate', [radius, 0]);
        context.codeManager.addOperation(sketchName, 'sketchOnPlane', ["XY"]);
        context.codeManager.addOperation(sketchName, 'extrude', [height, { twistAngle: 360 * turns }]);
        return sketchName;
    }
};

export default coilTool;

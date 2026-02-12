import type { Tool, ToolContext } from '../../../types';

export const planeTool: Tool = {
    metadata: {
        id: 'plane',
        label: 'Plane',
        icon: 'Square',
        category: 'construct',
        description: 'Create a construction plane'
    },
    uiProperties: [
        {
            key: 'plane',
            label: 'Orientation',
            type: 'select',
            default: 'XY',
            options: [
                { value: 'XY', label: 'XY Plane' },
                { value: 'XZ', label: 'XZ Plane' },
                { value: 'YZ', label: 'YZ Plane' }
            ]
        },
        { key: 'offsetX', label: 'Offset X', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'offsetY', label: 'Offset Y', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'offsetZ', label: 'Offset Z', type: 'number', default: 0, unit: 'mm', step: 1 }
    ],
    create(context: ToolContext): string {
        const { plane = 'XY', offsetX = 0, offsetY = 0, offsetZ = 0 } = context.params;
        return context.codeManager.addFeature('makePlane', null, [plane, [offsetX, offsetY, offsetZ]]);
    }
};

export default planeTool;

import type { Tool } from '../../../types';

export const rotateTool: Tool = {
    metadata: {
        id: 'rotate',
        label: 'Rotate',
        icon: 'RotateCw',
        category: 'modify',
        description: 'Rotate selected objects',
        shortcut: 'R'
    },
    uiProperties: [
        { key: 'angle', label: 'Angle', type: 'number', default: 0, unit: 'deg', min: -360, max: 360, step: 15 },
        {
            key: 'axis',
            label: 'Axis',
            type: 'select',
            default: 'z',
            options: [
                { value: 'x', label: 'X Axis' },
                { value: 'y', label: 'Y Axis' },
                { value: 'z', label: 'Z Axis' }
            ]
        }
    ],
    selectionRequirements: {
        min: 1,
        allowedTypes: ['solid', 'sketch', 'face', 'edge']
    },
    execute(codeManager, selectedIds, params) {
        const { angle = 0, axis = 'z' } = params;
        const axisVector = axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
        selectedIds.forEach(id => {
            codeManager.addOperation(id, 'rotate', [angle, axisVector, [0, 0, 0]]);
        });
    }
};

export default rotateTool;

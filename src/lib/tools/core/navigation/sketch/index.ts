import type { Tool } from '../../../types';

export const sketchTool: Tool = {
    metadata: {
        id: 'sketch',
        label: 'Sketch',
        icon: 'Pencil',
        category: 'navigation',
        description: 'Enter sketch mode',
        shortcut: 'S'
    },
    uiProperties: [
        {
            key: 'plane',
            label: 'Sketch Plane',
            type: 'select',
            default: 'XY',
            options: [
                { value: 'XY', label: 'XY Plane (Top)' },
                { value: 'XZ', label: 'XZ Plane (Front)' },
                { value: 'YZ', label: 'YZ Plane (Right)' },
                { value: 'face', label: 'Select Face' }
            ]
        }
    ]
};

export default sketchTool;

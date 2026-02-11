import type { Tool } from '../../../types';

export const measureTool: Tool = {
    metadata: {
        id: 'measure',
        label: 'Measure',
        icon: 'Ruler',
        category: 'inspect',
        description: 'Measure distances and dimensions',
        shortcut: 'Ctrl+M'
    },
    uiProperties: [
        {
            key: 'measureType',
            label: 'Measure Type',
            type: 'select',
            default: 'distance',
            options: [
                { value: 'distance', label: 'Distance' },
                { value: 'angle', label: 'Angle' },
                { value: 'radius', label: 'Radius/Diameter' },
                { value: 'area', label: 'Area' }
            ]
        }
    ],
    selectionRequirements: {
        min: 1,
        max: 2,
        allowedTypes: ['solid', 'face', 'edge']
    }
    // Note: Measurement is handled interactively in the viewport
};

export default measureTool;

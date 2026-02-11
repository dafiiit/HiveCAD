import type { Tool } from '../../../types';

export const analyzeTool: Tool = {
    metadata: {
        id: 'analyze',
        label: 'Analyze',
        icon: 'Search',
        category: 'inspect',
        description: 'Analyze geometry properties',
        shortcut: 'Ctrl+I'
    },
    uiProperties: [
        {
            key: 'analysisType',
            label: 'Analysis Type',
            type: 'select',
            default: 'properties',
            options: [
                { value: 'properties', label: 'Properties' },
                { value: 'volume', label: 'Volume & Mass' },
                { value: 'centerOfMass', label: 'Center of Mass' },
                { value: 'boundingBox', label: 'Bounding Box' },
                { value: 'surfaceArea', label: 'Surface Area' }
            ]
        },
        { key: 'density', label: 'Material Density', type: 'number', default: 1.0, unit: 'g/cm³', min: 0.001, step: 0.1 }
    ],
    selectionRequirements: {
        min: 1,
        allowedTypes: ['solid']
    }
    // Note: Analysis results are shown in a panel/dialog
};

export default analyzeTool;

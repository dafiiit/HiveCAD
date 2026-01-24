import type { Tool } from '../types';
import type { CodeManager } from '../../code-manager';

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
        }
    ],
    create(codeManager: CodeManager, params: Record<string, any>): string {
        const { plane = 'XY' } = params;
        return codeManager.addFeature('makePlane', null, [plane]);
    }
};

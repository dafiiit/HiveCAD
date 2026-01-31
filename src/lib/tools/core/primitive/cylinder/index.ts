import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

export const cylinderTool: Tool = {
    metadata: {
        id: 'cylinder',
        label: 'Cylinder',
        icon: 'Cylinder',
        category: 'primitive',
        description: 'Create a cylinder',
        shortcut: 'C'
    },
    uiProperties: [
        { key: 'radius', label: 'Radius', type: 'number', default: 5, unit: 'mm', min: 0.1, step: 0.5 },
        { key: 'height', label: 'Height', type: 'number', default: 15, unit: 'mm', min: 0.1, step: 0.5 }
    ],
    create(codeManager: CodeManager, params: Record<string, any>): string {
        const { radius = 5, height = 15 } = params;
        return codeManager.addFeature('makeCylinder', null, [radius, height]);
    }
};

export default cylinderTool;

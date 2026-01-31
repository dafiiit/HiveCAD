import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

export const sphereTool: Tool = {
    metadata: {
        id: 'sphere',
        label: 'Sphere',
        icon: 'Circle',
        category: 'primitive',
        description: 'Create a sphere'
    },
    uiProperties: [
        { key: 'radius', label: 'Radius', type: 'number', default: 10, unit: 'mm', min: 0.1, step: 0.5 }
    ],
    create(codeManager: CodeManager, params: Record<string, any>): string {
        const { radius = 10 } = params;
        return codeManager.addFeature('makeSphere', null, [radius]);
    }
};

export default sphereTool;

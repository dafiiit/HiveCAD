import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

export const boxTool: Tool = {
    metadata: {
        id: 'box',
        label: 'Box',
        icon: 'Box',
        category: 'primitive',
        description: 'Create a rectangular box',
        shortcut: 'B'
    },
    uiProperties: [
        { key: 'width', label: 'Width', type: 'number', default: 10, unit: 'mm', min: 0.1, step: 0.5 },
        { key: 'height', label: 'Height', type: 'number', default: 10, unit: 'mm', min: 0.1, step: 0.5 },
        { key: 'depth', label: 'Depth', type: 'number', default: 10, unit: 'mm', min: 0.1, step: 0.5 }
    ],
    create(codeManager: CodeManager, params: Record<string, any>): string {
        const { width = 10, height = 10, depth = 10 } = params;
        // Replicad makeBaseBox uses (x, y, z) convention
        return codeManager.addFeature('makeBaseBox', null, [width, depth, height]);
    }
};

export default boxTool;

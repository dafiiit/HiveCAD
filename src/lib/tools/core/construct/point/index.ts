import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

export const pointTool: Tool = {
    metadata: {
        id: 'point',
        label: 'Point',
        icon: 'Crosshair',
        category: 'construct',
        description: 'Create a reference point',
        shortcut: 'Shift+P'
    },
    uiProperties: [
        { key: 'x', label: 'X', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'y', label: 'Y', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'z', label: 'Z', type: 'number', default: 0, unit: 'mm', step: 1 }
    ],
    create(codeManager: CodeManager, params: Record<string, any>): string {
        const { x = 0, y = 0, z = 0 } = params;
        // Create a reference point
        return codeManager.addFeature('makePoint', null, [[x, y, z]]);
    }
};

export default pointTool;

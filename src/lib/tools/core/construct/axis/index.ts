import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

export const axisTool: Tool = {
    metadata: {
        id: 'axis',
        label: 'Axis',
        icon: 'ArrowUpDown',
        category: 'construct',
        description: 'Create a datum axis',
        shortcut: 'A'
    },
    uiProperties: [
        {
            key: 'direction',
            label: 'Direction',
            type: 'select',
            default: 'z',
            options: [
                { value: 'x', label: 'X Axis' },
                { value: 'y', label: 'Y Axis' },
                { value: 'z', label: 'Z Axis' },
                { value: 'custom', label: 'Custom' }
            ]
        },
        { key: 'originX', label: 'Origin X', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'originY', label: 'Origin Y', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'originZ', label: 'Origin Z', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'dirX', label: 'Dir X', type: 'number', default: 0, step: 0.1 },
        { key: 'dirY', label: 'Dir Y', type: 'number', default: 0, step: 0.1 },
        { key: 'dirZ', label: 'Dir Z', type: 'number', default: 1, step: 0.1 },
        { key: 'length', label: 'Length', type: 'number', default: 100, unit: 'mm', min: 1, step: 10 }
    ],
    create(codeManager: CodeManager, params: Record<string, any>): string {
        const { direction = 'z', originX = 0, originY = 0, originZ = 0, dirX = 0, dirY = 0, dirZ = 1, length = 100 } = params;

        let dir: [number, number, number];
        switch (direction) {
            case 'x': dir = [1, 0, 0]; break;
            case 'y': dir = [0, 1, 0]; break;
            case 'z': dir = [0, 0, 1]; break;
            default: dir = [dirX, dirY, dirZ];
        }

        // Create a datum axis as a helper object
        return codeManager.addFeature('makeDatumAxis', null, [[originX, originY, originZ], dir, length]);
    }
};

export default axisTool;

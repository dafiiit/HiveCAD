import type { Tool } from '../../../types';

export const moveTool: Tool = {
    metadata: {
        id: 'move',
        label: 'Move',
        icon: 'Move',
        category: 'modify',
        description: 'Move selected objects',
        shortcut: 'M'
    },
    uiProperties: [
        { key: 'x', label: 'X Offset', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'y', label: 'Y Offset', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'z', label: 'Z Offset', type: 'number', default: 0, unit: 'mm', step: 1 }
    ],
    selectionRequirements: {
        min: 1,
        allowedTypes: ['solid', 'sketch', 'face', 'edge']
    },
    execute(codeManager, selectedIds, params) {
        const { x = 0, y = 0, z = 0 } = params;
        selectedIds.forEach(id => {
            codeManager.addOperation(id, 'translate', [[x, y, z]]);
        });
    }
};

export default moveTool;

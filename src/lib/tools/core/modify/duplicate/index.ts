import type { Tool } from '../../../types';

export const duplicateTool: Tool = {
    metadata: {
        id: 'duplicate',
        label: 'Duplicate',
        icon: 'Copy',
        category: 'modify',
        description: 'Duplicate selected objects',
        shortcut: 'Ctrl+D'
    },
    uiProperties: [
        { key: 'offsetX', label: 'X Offset', type: 'number', default: 10, unit: 'mm', step: 1 },
        { key: 'offsetY', label: 'Y Offset', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'offsetZ', label: 'Z Offset', type: 'number', default: 0, unit: 'mm', step: 1 },
        { key: 'copies', label: 'Copies', type: 'number', default: 1, min: 1, max: 100, step: 1 }
    ],
    selectionRequirements: {
        min: 1,
        allowedTypes: ['solid', 'sketch']
    }
    // Note: Duplicate operation is handled by the store's duplicateSelected action
};

export default duplicateTool;

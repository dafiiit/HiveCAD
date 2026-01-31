import type { Tool } from '../../../types';

export const deleteTool: Tool = {
    metadata: {
        id: 'delete',
        label: 'Delete',
        icon: 'Trash2',
        category: 'modify',
        description: 'Delete selected objects',
        shortcut: 'Delete'
    },
    uiProperties: [],
    selectionRequirements: {
        min: 1,
        allowedTypes: ['solid', 'sketch', 'face', 'edge', 'datumAxis']
    }
    // Note: Delete operation is handled by the store's deleteObject action
};

export default deleteTool;

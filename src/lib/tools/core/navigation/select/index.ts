import type { Tool } from '../../../types';

export const selectTool: Tool = {
    metadata: {
        id: 'select',
        label: 'Select',
        icon: 'MousePointer2',
        category: 'navigation',
        description: 'Select objects',
        shortcut: 'V'
    },
    uiProperties: []
};

export default selectTool;

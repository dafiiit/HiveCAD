import type { Tool } from '../../../types';

export const panTool: Tool = {
    metadata: {
        id: 'pan',
        label: 'Pan',
        icon: 'Hand',
        category: 'navigation',
        description: 'Pan the view',
        shortcut: 'H'
    },
    uiProperties: []
};

export default panTool;

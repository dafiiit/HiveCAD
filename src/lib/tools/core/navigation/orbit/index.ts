import type { Tool } from '../../../types';

export const orbitTool: Tool = {
    metadata: {
        id: 'orbit',
        label: 'Orbit',
        icon: 'Orbit',
        category: 'navigation',
        description: 'Orbit around the scene',
        shortcut: 'O'
    },
    uiProperties: []
};

export default orbitTool;

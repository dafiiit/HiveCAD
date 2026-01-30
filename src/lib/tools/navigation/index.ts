import type { Tool } from '../types';

export const selectTool: Tool = {
    metadata: {
        id: 'select',
        label: 'Select',
        icon: 'MousePointer2',
        category: 'navigation',
        description: 'Select objects'
    },
    uiProperties: []
};

export const panTool: Tool = {
    metadata: {
        id: 'pan',
        label: 'Pan',
        icon: 'Hand',
        category: 'navigation',
        description: 'Pan the view'
    },
    uiProperties: []
};

export const orbitTool: Tool = {
    metadata: {
        id: 'orbit',
        label: 'Orbit',
        icon: 'Orbit',
        category: 'navigation',
        description: 'Orbit around the scene'
    },
    uiProperties: []
};

export const measureTool: Tool = {
    metadata: {
        id: 'measure',
        label: 'Measure',
        icon: 'Ruler',
        category: 'navigation',
        description: 'Measure distances and dimensions'
    },
    uiProperties: []
};
export const sketchTool: Tool = {
    metadata: {
        id: 'sketch',
        label: 'Sketch',
        icon: 'Pencil',
        category: 'navigation',
        description: 'Enter sketch mode'
    },
    uiProperties: []
};

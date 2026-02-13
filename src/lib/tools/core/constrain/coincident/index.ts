import type { Tool } from '../../../types';

/**
 * Coincident Constraint Tool
 * 
 * Constrains two points or a point and an entity to coincide.
 */
export const coincidentTool: Tool = {
    metadata: {
        id: 'coincident',
        label: 'Coincident',
        icon: 'Locate',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain two points to coincide',
    },
    uiProperties: [],
};

import type { Tool } from '../../../types';

/**
 * Tangent Constraint Tool
 * 
 * Constrains two curves to be tangent at their connection point.
 */
export const tangentTool: Tool = {
    metadata: {
        id: 'tangent',
        label: 'Tangent',
        icon: 'Route',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain two curves to be tangent at their connection point',
    },
    uiProperties: [],
};

import type { Tool } from '../../../types';

/**
 * Equal Constraint Tool
 * 
 * Constrains two sketch entities to have equal dimensions.
 */
export const equalTool: Tool = {
    metadata: {
        id: 'equal',
        label: 'Equal',
        icon: 'Equal',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain two sketch entities to have equal dimensions',
    },
    uiProperties: [],
};

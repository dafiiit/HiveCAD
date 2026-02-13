import type { Tool } from '../../../types';

/**
 * Parallel Constraint Tool
 *
 * Constrains two lines to be parallel.
 * Selection: 2 Lines.
 */
export const parallelTool: Tool = {
    metadata: {
        id: 'parallel',
        label: 'Parallel',
        icon: 'AlignVerticalSpaceAround',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain two lines to be parallel',
    },
    uiProperties: [],
};

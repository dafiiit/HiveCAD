import type { Tool } from '../../../types';

/**
 * Collinear Constraint Tool
 *
 * Constrains two lines to lie on the same infinite line (parallel + on-line).
 * Selection: 2 Lines.
 */
export const collinearTool: Tool = {
    metadata: {
        id: 'collinear',
        label: 'Collinear',
        icon: 'GripVertical',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain two lines to be collinear',
    },
    uiProperties: [],
};

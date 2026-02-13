import type { Tool } from '../../../types';

/**
 * Point On Line Constraint Tool
 *
 * Constrains a point to lie on a line.
 * Selection: 1 Point + 1 Line.
 */
export const pointOnLineTool: Tool = {
    metadata: {
        id: 'pointOnLine',
        label: 'Point on Line',
        icon: 'Dot',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain a point to lie on a line',
    },
    uiProperties: [],
};

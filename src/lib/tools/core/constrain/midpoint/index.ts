import type { Tool } from '../../../types';

/**
 * Midpoint Constraint Tool
 *
 * Constrains a point to lie at the midpoint of a line segment.
 * Selection: 1 Point + 1 Line.
 */
export const midpointTool: Tool = {
    metadata: {
        id: 'midpoint',
        label: 'Midpoint',
        icon: 'Crosshair',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain a point to the midpoint of a line',
    },
    uiProperties: [],
};

import type { Tool } from '../../../types';

/**
 * Point On Circle Constraint Tool
 *
 * Constrains a point to lie on a circle or arc.
 * Selection: 1 Point + 1 Circle/Arc.
 */
export const pointOnCircleTool: Tool = {
    metadata: {
        id: 'pointOnCircle',
        label: 'Point on Circle',
        icon: 'Target',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain a point to lie on a circle or arc',
    },
    uiProperties: [],
};

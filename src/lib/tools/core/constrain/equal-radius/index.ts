import type { Tool } from '../../../types';

/**
 * Equal Radius Constraint Tool
 *
 * Constrains two circles or arcs to have the same radius.
 * Selection: 2 Circles/Arcs.
 */
export const equalRadiusTool: Tool = {
    metadata: {
        id: 'equalRadius',
        label: 'Equal Radius',
        icon: 'CircleEqual',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain two circles or arcs to have equal radii',
    },
    uiProperties: [],
};

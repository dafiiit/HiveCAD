import type { Tool } from '../../../types';

/**
 * Concentric Constraint Tool
 *
 * Constrains two circles or arcs to share the same center point.
 * Selection: 2 Circles/Arcs.
 */
export const concentricTool: Tool = {
    metadata: {
        id: 'concentric',
        label: 'Concentric',
        icon: 'CircleDot',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain two circles or arcs to share the same center',
    },
    uiProperties: [],
};

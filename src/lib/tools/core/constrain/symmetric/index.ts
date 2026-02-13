import type { Tool } from '../../../types';

/**
 * Symmetric Constraint Tool
 *
 * Constrains two points to be symmetric about a mirror line.
 * The mirrored entities stay linked; moving one updates the other.
 * Selection: 2 Points + 1 Line (axis of symmetry).
 */
export const symmetricTool: Tool = {
    metadata: {
        id: 'symmetric',
        label: 'Symmetric',
        icon: 'FlipHorizontal',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain two points to be symmetric about a line',
    },
    uiProperties: [],
};

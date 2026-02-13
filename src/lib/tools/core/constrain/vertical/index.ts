import type { Tool } from '../../../types';

/**
 * Vertical Constraint Tool
 *
 * Constrains a line to be vertical, or two points to share the same X coordinate.
 * Selection: 1 Line OR 2 Points.
 */
export const verticalTool: Tool = {
    metadata: {
        id: 'vertical',
        label: 'Vertical',
        icon: 'ArrowDown',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain a line to be vertical or two points to share the same X',
        shortcut: 'V',
    },
    uiProperties: [],
};

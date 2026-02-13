import type { Tool } from '../../../types';

/**
 * Horizontal Constraint Tool
 *
 * Constrains a line to be horizontal, or two points to share the same Y coordinate.
 * Selection: 1 Line OR 2 Points.
 */
export const horizontalTool: Tool = {
    metadata: {
        id: 'horizontal',
        label: 'Horizontal',
        icon: 'ArrowRight',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain a line to be horizontal or two points to share the same Y',
        shortcut: 'H',
    },
    uiProperties: [],
};

import type { Tool } from '../../../types';

/**
 * Fixed Constraint Tool
 *
 * Locks an entity's position so the solver cannot move it.
 * Clicking again removes the fix.
 * Selection: 1+ entities (points, lines, circles).
 */
export const fixedTool: Tool = {
    metadata: {
        id: 'fixed',
        label: 'Fix / Unfix',
        icon: 'Lock',
        category: 'constrain',
        group: 'Constrain',
        description: 'Lock or unlock an entity position',
        shortcut: 'F',
    },
    uiProperties: [],
};

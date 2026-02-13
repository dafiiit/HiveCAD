import type { Tool } from '../../../types';

/**
 * Perpendicular Constraint Tool
 *
 * Constrains two lines to be perpendicular (at 90°).
 * Selection: 2 Lines.
 */
export const perpendicularTool: Tool = {
    metadata: {
        id: 'perpendicular',
        label: 'Perpendicular',
        icon: 'CornerDownRight',
        category: 'constrain',
        group: 'Constrain',
        description: 'Constrain two lines to be perpendicular',
    },
    uiProperties: [],
};

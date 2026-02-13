import type { Tool } from '../../../types';

/**
 * Sketch Point Tool
 * 
 * Places a reference point in the sketch.
 */
export const sketchPointTool: Tool = {
    metadata: {
        id: 'sketchPoint',
        label: 'Point',
        icon: 'CircleDot',
        category: 'sketch',
        group: 'Create',
        description: 'Place a reference point in the sketch',
    },
    uiProperties: [],
};

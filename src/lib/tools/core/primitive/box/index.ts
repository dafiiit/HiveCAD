import type { Tool, ToolContext } from '../../../types';
import { applyBoxFeature } from './logic';

export const boxTool: Tool = {
    metadata: {
        id: 'box',
        label: 'Box',
        icon: 'Box',
        category: 'primitive',
        description: 'Create a rectangular box',
        shortcut: 'B'
    },
    uiProperties: [
        { key: 'width', label: 'Width', type: 'number', default: 10, unit: 'mm', min: 0.1, step: 0.5 },
        { key: 'height', label: 'Height', type: 'number', default: 10, unit: 'mm', min: 0.1, step: 0.5 },
        { key: 'depth', label: 'Depth', type: 'number', default: 10, unit: 'mm', min: 0.1, step: 0.5 }
    ],
    create(context: ToolContext): string {
        return applyBoxFeature(context.codeManager, context.params);
    }
};

export default boxTool;

import type { Tool, ToolContext } from '../../../types';
import { resolveBooleanOperands } from '../operands';

export const intersectTool: Tool = {
    metadata: {
        id: 'intersect',
        label: 'Intersect',
        icon: 'Layers',
        category: 'boolean',
        description: 'Keep only the intersection of solids'
    },
    uiProperties: [
        { key: 'target', label: 'Body 1', type: 'selection', default: null, allowedTypes: ['solid'] },
        { key: 'tool', label: 'Body 2', type: 'selection', default: null, allowedTypes: ['solid'] },
        { key: 'keepTools', label: 'Keep original bodies', type: 'boolean', default: false },
    ],
    execute(context: ToolContext): void {
        const operands = resolveBooleanOperands(context);
        if (!operands) return;
        context.codeManager.combineFeatures('intersect', operands.primary, operands.secondaries, {
            keepTools: operands.keepTools,
        });
    }
};

export default intersectTool;

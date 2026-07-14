import type { Tool, ToolContext } from '../../../types';
import { resolveBooleanOperands } from '../operands';

export const joinTool: Tool = {
    metadata: {
        id: 'join',
        label: 'Join',
        icon: 'Combine',
        category: 'boolean',
        description: 'Fuse multiple solids into one',
        shortcut: 'Ctrl+J'
    },
    uiProperties: [
        { key: 'target', label: 'Body 1', type: 'selection', default: null, allowedTypes: ['solid'] },
        { key: 'tool', label: 'Body 2', type: 'selection', default: null, allowedTypes: ['solid'] },
        { key: 'keepTools', label: 'Keep original bodies', type: 'boolean', default: false },
    ],
    execute(context: ToolContext): void {
        const operands = resolveBooleanOperands(context);
        if (!operands) return;
        context.codeManager.combineFeatures('fuse', operands.primary, operands.secondaries, {
            keepTools: operands.keepTools,
        });
    }
};

export default joinTool;

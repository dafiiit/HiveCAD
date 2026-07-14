import type { Tool, ToolContext } from '../../../types';
import { resolveBooleanOperands } from '../operands';

export const cutTool: Tool = {
    metadata: {
        id: 'cut',
        label: 'Cut',
        icon: 'Scissors',
        category: 'boolean',
        description: 'Subtract one solid from another',
        shortcut: 'Ctrl+Shift+C'
    },
    uiProperties: [
        { key: 'target', label: 'Body (keep)', type: 'selection', default: null, allowedTypes: ['solid'] },
        { key: 'tool', label: 'Tool (subtract)', type: 'selection', default: null, allowedTypes: ['solid'] },
        { key: 'keepTools', label: 'Keep original bodies', type: 'boolean', default: false },
    ],
    execute(context: ToolContext): void {
        const operands = resolveBooleanOperands(context);
        if (!operands) return;
        context.codeManager.combineFeatures('cut', operands.primary, operands.secondaries, {
            keepTools: operands.keepTools,
        });
    }
};

export default cutTool;

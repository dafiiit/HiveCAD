import type { Tool, ToolContext } from '../../../types';
import { selectionNameOf } from '../../../../selection/durableSelection';

/** Collect the stable names of the selected edges on a single base body. */
function selectedEdgeNames(context: ToolContext): { baseId: string; names: string[] } | null {
    const edges = context.scene.selectedIds.filter(id => id.includes(':edge-'));
    if (edges.length === 0) return null;
    const baseId = edges[0].split(':')[0];
    const names = edges
        .filter(id => id.split(':')[0] === baseId)
        .map(id => selectionNameOf(id, context.scene.objects))
        .filter((n): n is string => !!n);
    return names.length ? { baseId, names } : null;
}

export const chamferTool: Tool = {
    metadata: {
        id: 'chamfer',
        label: 'Chamfer',
        icon: 'Triangle',
        category: 'operation',
        description: 'Bevel selected edges',
    },
    uiProperties: [
        { key: 'distance', label: 'Distance', type: 'number', default: 1, unit: 'mm', min: 0.01, step: 0.5 },
    ],
    selectionRequirements: { min: 1, allowedTypes: ['edge'] },
    execute(context: ToolContext): void {
        const sel = selectedEdgeNames(context);
        if (!sel) return;
        context.codeManager.applyReferenceOp('__chamfer', sel.baseId, sel.names, context.params?.distance ?? 1);
    },
};

export default chamferTool;

import type { Tool, ToolContext } from '../../../types';
import { selectionNameOf } from '../../../../selection/durableSelection';

/** Collect the stable names of the selected faces on a single base body. */
function selectedFaceNames(context: ToolContext): { baseId: string; names: string[] } | null {
    const faces = context.scene.selectedIds.filter(id => id.includes(':face-'));
    if (faces.length === 0) return null;
    const baseId = faces[0].split(':')[0];
    const names = faces
        .filter(id => id.split(':')[0] === baseId)
        .map(id => selectionNameOf(id, context.scene.objects))
        .filter((n): n is string => !!n);
    return names.length ? { baseId, names } : null;
}

export const shellTool: Tool = {
    metadata: {
        id: 'shell',
        label: 'Shell',
        icon: 'Box',
        category: 'operation',
        description: 'Hollow the body, removing selected faces',
    },
    uiProperties: [
        { key: 'thickness', label: 'Wall thickness', type: 'number', default: 1, unit: 'mm', min: 0.01, step: 0.5 },
    ],
    selectionRequirements: { min: 1, allowedTypes: ['face'] },
    execute(context: ToolContext): void {
        const sel = selectedFaceNames(context);
        if (!sel) return;
        // replicad's shell removes the given faces and offsets the rest inward.
        context.codeManager.applyReferenceOp('__shell', sel.baseId, sel.names, context.params?.thickness ?? 1);
    },
};

export default shellTool;

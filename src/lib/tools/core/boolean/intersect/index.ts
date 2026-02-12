import type { Tool, ToolContext } from '../../../types';

export const intersectTool: Tool = {
    metadata: {
        id: 'intersect',
        label: 'Intersect',
        icon: 'Layers',
        category: 'boolean',
        description: 'Keep only the intersection of solids'
    },
    uiProperties: [],
    selectionRequirements: {
        min: 2,
        allowedTypes: ['solid']
    },
    execute(context: ToolContext): void {
        const { codeManager } = context;
        const selectedIds = context.scene.selectedIds;
        if (selectedIds.length < 2) return;

        const primaryId = selectedIds[0];
        const secondaryIds = selectedIds.slice(1);

        secondaryIds.forEach(id => {
            codeManager.addOperation(primaryId, 'intersect', [{ type: 'raw', content: id }]);
        });

        secondaryIds.forEach(id => {
            codeManager.removeFeature(id);
        });
    }
};

export default intersectTool;

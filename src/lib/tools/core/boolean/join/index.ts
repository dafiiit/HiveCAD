import type { Tool, ToolContext } from '../../../types';

export const joinTool: Tool = {
    metadata: {
        id: 'join',
        label: 'Join',
        icon: 'Combine',
        category: 'boolean',
        description: 'Fuse multiple solids into one',
        shortcut: 'Ctrl+J'
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
            codeManager.addOperation(primaryId, 'fuse', [{ type: 'raw', content: id }]);
        });

        // Remove secondary objects from being returned
        secondaryIds.forEach(id => {
            codeManager.removeFeature(id);
        });
    }
};

export default joinTool;

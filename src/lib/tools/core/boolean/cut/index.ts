import type { Tool, ToolContext } from '../../../types';

export const cutTool: Tool = {
    metadata: {
        id: 'cut',
        label: 'Cut',
        icon: 'Scissors',
        category: 'boolean',
        description: 'Subtract one solid from another',
        shortcut: 'Ctrl+Shift+C'
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
            codeManager.addOperation(primaryId, 'cut', [{ type: 'raw', content: id }]);
        });

        secondaryIds.forEach(id => {
            codeManager.removeFeature(id);
        });
    }
};

export default cutTool;

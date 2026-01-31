import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

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
    execute(codeManager: CodeManager, selectedIds: string[]): void {
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

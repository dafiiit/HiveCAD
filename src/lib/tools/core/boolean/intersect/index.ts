import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

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
    execute(codeManager: CodeManager, selectedIds: string[]): void {
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

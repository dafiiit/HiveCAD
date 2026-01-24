import type { Tool } from '../types';
import type { CodeManager } from '../../code-manager';

export const joinTool: Tool = {
    metadata: {
        id: 'join',
        label: 'Join',
        icon: 'Combine',
        category: 'boolean',
        description: 'Fuse multiple solids into one'
    },
    uiProperties: [],
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

export const cutTool: Tool = {
    metadata: {
        id: 'cut',
        label: 'Cut',
        icon: 'SplitSquareVertical',
        category: 'boolean',
        description: 'Subtract one solid from another'
    },
    uiProperties: [],
    execute(codeManager: CodeManager, selectedIds: string[]): void {
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

export const intersectTool: Tool = {
    metadata: {
        id: 'intersect',
        label: 'Intersect',
        icon: 'Layers',
        category: 'boolean',
        description: 'Keep only the intersection of solids'
    },
    uiProperties: [],
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

import type { Tool } from '../../../types';

export const scaleTool: Tool = {
    metadata: {
        id: 'scale',
        label: 'Scale',
        icon: 'Scale',
        category: 'modify',
        description: 'Scale selected objects',
        shortcut: 'Shift+S'
    },
    uiProperties: [
        { key: 'factor', label: 'Scale Factor', type: 'number', default: 1, min: 0.01, max: 100, step: 0.1 },
        { key: 'uniform', label: 'Uniform Scale', type: 'boolean', default: true },
        { key: 'scaleX', label: 'X Scale', type: 'number', default: 1, min: 0.01, max: 100, step: 0.1 },
        { key: 'scaleY', label: 'Y Scale', type: 'number', default: 1, min: 0.01, max: 100, step: 0.1 },
        { key: 'scaleZ', label: 'Z Scale', type: 'number', default: 1, min: 0.01, max: 100, step: 0.1 }
    ],
    selectionRequirements: {
        min: 1,
        allowedTypes: ['solid', 'sketch']
    },
    execute(codeManager, selectedIds, params) {
        const { factor = 1, uniform = true, scaleX = 1, scaleY = 1, scaleZ = 1 } = params;
        const scaleValue = uniform ? factor : [scaleX, scaleY, scaleZ];
        selectedIds.forEach(id => {
            codeManager.addOperation(id, 'scale', [scaleValue]);
        });
    }
};

export default scaleTool;

import type { Tool } from '../../../types';

export const patternTool: Tool = {
    metadata: {
        id: 'pattern',
        label: 'Pattern',
        icon: 'Grid3X3',
        category: 'configure',
        description: 'Create linear or circular patterns',
        shortcut: 'Ctrl+P'
    },
    uiProperties: [
        {
            key: 'type',
            label: 'Pattern Type',
            type: 'select',
            default: 'linear',
            options: [
                { value: 'linear', label: 'Linear' },
                { value: 'rectangular', label: 'Rectangular' },
                { value: 'circular', label: 'Circular' }
            ]
        },
        { key: 'countX', label: 'Count X', type: 'number', default: 3, min: 1, max: 100, step: 1 },
        { key: 'countY', label: 'Count Y', type: 'number', default: 1, min: 1, max: 100, step: 1 },
        { key: 'spacingX', label: 'Spacing X', type: 'number', default: 20, unit: 'mm', step: 1 },
        { key: 'spacingY', label: 'Spacing Y', type: 'number', default: 20, unit: 'mm', step: 1 },
        { key: 'angle', label: 'Angle Step', type: 'number', default: 45, unit: 'deg', min: 1, max: 360, step: 15 }
    ],
    selectionRequirements: {
        min: 1,
        allowedTypes: ['solid', 'sketch']
    },
    execute(codeManager, selectedIds, params) {
        const { type = 'linear', countX = 3, countY = 1, spacingX = 20, spacingY = 20, angle = 45 } = params;

        selectedIds.forEach(id => {
            if (type === 'linear') {
                // Linear pattern along X axis
                for (let i = 1; i < countX; i++) {
                    codeManager.addOperation(id, 'translate', [[spacingX * i, 0, 0]]);
                }
            } else if (type === 'rectangular') {
                // Rectangular grid pattern
                for (let i = 0; i < countX; i++) {
                    for (let j = 0; j < countY; j++) {
                        if (i === 0 && j === 0) continue;
                        codeManager.addOperation(id, 'translate', [[spacingX * i, spacingY * j, 0]]);
                    }
                }
            }
            // Circular pattern would require different approach
        });
    }
};

export default patternTool;

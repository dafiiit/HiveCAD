import type { Tool, ToolContext } from '../../../types';

export const translatePlaneTool: Tool = {
    metadata: {
        id: 'translatePlane',
        label: 'Translate Plane',
        icon: 'Move3D',
        category: 'operation',
        description: 'Translate a plane in 3D space'
    },
    uiProperties: [
        { key: 'x', label: 'X Offset', type: 'number', default: 0, unit: 'mm' },
        { key: 'y', label: 'Y Offset', type: 'number', default: 0, unit: 'mm' },
        { key: 'z', label: 'Z Offset', type: 'number', default: 0, unit: 'mm' }
    ],
    execute(context: ToolContext): void {
        const { codeManager } = context;
        const selectedId = context.scene.selectedIds[0];
        if (selectedId) {
            const { x = 0, y = 0, z = 0 } = context.params;
            codeManager.addOperation(selectedId, 'translate', [x, y, z]);
        }
    }
};

export default translatePlaneTool;

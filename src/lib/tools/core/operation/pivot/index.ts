import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

export const pivotTool: Tool = {
    metadata: {
        id: 'pivot',
        label: 'Pivot Plane',
        icon: 'RotateCcw',
        category: 'operation',
        description: 'Pivot a plane around an axis'
    },
    uiProperties: [
        { key: 'angle', label: 'Angle', type: 'number', default: 45, unit: 'deg' }
    ],
    execute(codeManager: CodeManager, selectedIds: string[], params: Record<string, any>): void {
        const selectedId = selectedIds[0];
        if (selectedId) {
            const { angle = 45, axis = [0, 0, 1] } = params;
            codeManager.addOperation(selectedId, 'pivot', [angle, axis]);
        }
    }
};

export default pivotTool;

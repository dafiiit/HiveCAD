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
        { key: 'angle', label: 'Angle', type: 'number', default: 45, unit: 'deg' },
        {
            key: 'axis',
            label: 'Axis',
            type: 'select',
            default: 'Z',
            options: [
                { value: 'X', label: 'X Axis' },
                { value: 'Y', label: 'Y Axis' },
                { value: 'Z', label: 'Z Axis' },
            ]
        }
    ],
    execute(codeManager: CodeManager, selectedIds: string[], params: Record<string, any>): void {
        const selectedId = selectedIds[0];
        if (selectedId) {
            const { angle = 45, axis = 'Z' } = params;
            const axisMap: Record<string, number[]> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
            const axisVec = axisMap[axis] || [0, 0, 1];
            codeManager.addOperation(selectedId, 'pivot', [angle, axisVec]);
        }
    }
};

export default pivotTool;

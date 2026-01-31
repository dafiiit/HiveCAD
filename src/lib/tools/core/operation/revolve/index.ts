import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

export const revolveTool: Tool = {
    metadata: {
        id: 'revolve',
        label: 'Revolve',
        icon: 'RotateCw',
        category: 'operation',
        description: 'Revolve a sketch around an axis'
    },
    uiProperties: [
        {
            key: 'profile',
            label: 'Profile',
            type: 'selection',
            default: null,
            allowedTypes: ['sketch', 'face']
        },
        {
            key: 'axis',
            label: 'Axis',
            type: 'selection',
            default: null,
            allowedTypes: ['edge', 'datumAxis']
        },
        {
            key: 'projectAxis',
            label: 'Project Axis',
            type: 'boolean',
            default: true
        },
        {
            key: 'limitType',
            label: 'Limit Type',
            type: 'select',
            default: 'Full',
            options: [
                { value: 'Full', label: 'Full (360°)' },
                { value: 'Partial', label: 'Partial' }
            ]
        },
        {
            key: 'angle',
            label: 'Angle',
            type: 'number',
            default: 360,
            unit: 'deg',
            min: 1,
            max: 360
        }
    ],
    selectionRequirements: {
        min: 1,
        max: 2,
        allowedTypes: ['sketch', 'face', 'edge', 'datumAxis']
    },
    execute(codeManager: CodeManager, selectedIds: string[], params: Record<string, any>): void {
        const { profile, axis, angle, limitType } = params;

        if (profile) {
            const args: any[] = [];

            if (axis) {
                if (axis === 'AXIS_X') args.push([1, 0, 0]);
                else if (axis === 'AXIS_Y') args.push([0, 1, 0]);
                else if (axis === 'AXIS_Z') args.push([0, 0, 1]);
                else args.push(axis);
            }

            codeManager.addOperation(profile, 'revolve', args);
        }
    }
};

export default revolveTool;

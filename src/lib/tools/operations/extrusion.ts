import type { Tool } from '../types';
import type { CodeManager } from '../../code-manager';

export const extrusionTool: Tool = {
    metadata: {
        id: 'extrusion',
        label: 'Extrude',
        icon: 'ArrowUpRight',
        category: 'operation',
        description: 'Extrude a sketch into a 3D solid'
    },
    uiProperties: [
        { key: 'distance', label: 'Distance', type: 'number', default: 10, unit: 'mm', min: 0.1 },
        { key: 'twistAngle', label: 'Twist Angle', type: 'number', default: 0, unit: 'deg' },
        { key: 'endFactor', label: 'End Factor', type: 'number', default: 1, min: 0, max: 2, step: 0.1 },
        {
            key: 'profile',
            label: 'Profile',
            type: 'select',
            default: 'linear',
            options: [
                { value: 'linear', label: 'Linear' },
                { value: 's-curve', label: 'S-Curve' }
            ]
        }
    ],
    selectionRequirements: {
        min: 1,
        max: 1,
        allowedTypes: ['sketch', 'face']
    },
    execute(codeManager: CodeManager, selectedIds: string[], params: Record<string, any>): void {
        const selectedId = selectedIds[0];
        if (selectedId) {
            const { distance = 10, twistAngle, endFactor } = params;
            const extrudeArgs: any[] = [distance];


            // Only add options object if there are non-default values
            // We pass extrusionDirection to ensure it follows the sketch normal (especially for non-XY planes)
            const opts: Record<string, any> = {
                extrusionDirection: { type: 'raw', content: `${selectedId}._defaultDirection` }
            };

            if (twistAngle) opts.twistAngle = twistAngle;
            if (endFactor !== 1) opts.endFactor = endFactor;

            // Always pass the opts object now since it contains the direction
            extrudeArgs.push(opts);


            codeManager.addOperation(selectedId, 'extrude', extrudeArgs);
        }
    }
};


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
    execute(codeManager: CodeManager, selectedIds: string[], params: Record<string, any>): void {
        const selectedId = selectedIds[0];
        if (selectedId) {
            const { x = 0, y = 0, z = 0 } = params;
            codeManager.addOperation(selectedId, 'translate', [x, y, z]);
        }
    }
};

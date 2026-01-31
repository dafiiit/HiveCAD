import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

export const extrusionTool: Tool = {
    metadata: {
        id: 'extrusion',
        label: 'Extrude',
        icon: 'ArrowUp',
        category: 'operation',
        description: 'Extrude a sketch into a 3D solid',
        shortcut: 'E'
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

            const opts: Record<string, any> = {};
            if (twistAngle) opts.twistAngle = twistAngle;
            if (endFactor !== 1) opts.endFactor = endFactor;

            // Check if selecting a face of a solid
            if (selectedId.includes(':face-')) {
                const [baseId, faceStr] = selectedId.split(':face-');
                const faceIndex = parseInt(faceStr);

                if (!isNaN(faceIndex)) {
                    // Separate logic for Face Extrusion: Create NEW object
                    const faceVar = codeManager.addFeature('face', baseId, [faceIndex]);
                    if (Object.keys(opts).length > 0) extrudeArgs.push(opts);
                    codeManager.addFeature('extrude', faceVar, extrudeArgs);
                    return;
                }
            }

            // Normal Sketch Extrusion (Mutation)
            if (!opts.extrusionDirection) {
                opts.extrusionDirection = { type: 'raw', content: `${selectedId}._defaultDirection` };
            }

            extrudeArgs.push(opts);
            codeManager.addOperation(selectedId, 'extrude', extrudeArgs);
        }
    }
};

export default extrusionTool;

import type { Tool } from '../../../types';
import type { ToolContext } from '../../../types';
import { renderExtrusionPreview } from './preview';
import { executeExtrusion, inferFaceNormalAxis } from './logic';

export const extrusionTool: Tool = {
    metadata: {
        id: 'extrusion',
        label: 'Extrude',
        icon: 'ArrowUp',
        category: 'operation',
        description: 'Extrude a sketch or face into a 3D solid',
        shortcut: 'E'
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
        { key: 'distance', label: 'Distance', type: 'number', default: 10, unit: 'mm' },
        {
            key: 'operation',
            label: 'Operation',
            type: 'select',
            default: 'new',
            options: [
                { value: 'new', label: 'New Body' },
                { value: 'join', label: 'Join' },
                { value: 'cut', label: 'Cut' },
                { value: 'intersect', label: 'Intersect' }
            ]
        },
        { key: 'twistAngle', label: 'Twist Angle', type: 'number', default: 0, unit: 'deg' },
        { key: 'endFactor', label: 'End Factor', type: 'number', default: 1, min: 0, max: 2, step: 0.1 }
    ],
    selectionRequirements: {
        min: 1,
        max: 2,
        allowedTypes: ['sketch', 'face', 'edge', 'datumAxis']
    },
    execute(context: ToolContext): void {
        executeExtrusion({
            codeManager: context.codeManager,
            selectedIds: context.scene.selectedIds,
            params: context.params,
        });
    },
    onPropertyChange(params, key, value, objects) {
        if (key === 'profile' && typeof value === 'string') {
            return inferFaceNormalAxis(value, objects, params.axis);
        }
    },
    render3DPreview: renderExtrusionPreview,
};

export default extrusionTool;

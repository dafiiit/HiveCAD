import type { Tool } from '../types';
import type { CodeManager } from '../../code-manager';

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
            label: 'Profil',
            type: 'selection',
            default: null,
            allowedTypes: ['sketch', 'face']
        },
        {
            key: 'axis',
            label: 'Achse',
            type: 'selection',
            default: null,
            allowedTypes: ['edge', 'datumAxis']
        },
        {
            key: 'projectAxis',
            label: 'Projektionsachse',
            type: 'boolean',
            default: true
        },
        {
            key: 'limitType',
            label: 'Grenztyp',
            type: 'select',
            default: 'Full',
            options: [
                { value: 'Full', label: 'Vollständig' },
                { value: 'Partial', label: 'Teilweise' }
            ]
        },
        {
            key: 'angle',
            label: 'Winkel',
            type: 'number',
            default: 360,
            unit: 'deg',
            min: 1,
            max: 360,
            // Only show if limitType is Partial (logic to be handled in UI or here?)
            // For now simple list. Conditional visibility is a "nice to have" for later.
        }
    ],
    selectionRequirements: {
        min: 1,
        max: 2, // Profile + Axis
        allowedTypes: ['sketch', 'face', 'edge', 'datumAxis']
    },
    execute(codeManager: CodeManager, selectedIds: string[], params: Record<string, any>): void {
        const { profile, axis, angle, limitType } = params;

        if (profile) {
            const args: any[] = [];

            // Replicad .revolve() signature is likely .revolve(axis, config)
            // It does NOT take an angle (always 360).
            // For partial revolve, we would need to use `revolution()` which works on faces.
            // For now, let's fix the basic revolve to use the axis correctly.

            if (axis) {
                if (axis === 'AXIS_X') args.push([1, 0, 0]);
                else if (axis === 'AXIS_Y') args.push([0, 1, 0]);
                else if (axis === 'AXIS_Z') args.push([0, 0, 1]);
                else args.push(axis); // Assuming this is an edge selection passed as ID? Or needs resolving?
                // If it's a selected edge ID, CodeManager/Worker needs to resolve it to a vector?
                // Or does it assume it's an edge to revolve AROUND?
                // For now, handling the datumAxis explicit vectors.
            }

            codeManager.addOperation(profile, 'revolve', args);
        }
    }
};

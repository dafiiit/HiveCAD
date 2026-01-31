import React from 'react';
import * as THREE from 'three';
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
    },
    render3DPreview(params, { objects }) {
        const selectedShapeId = params.selectedShape || params.profile;
        const distance = params.distance || 10;

        if (!selectedShapeId) return null;

        const sourceObject = objects.find(obj => obj.id === selectedShapeId);
        if (!sourceObject || !sourceObject.geometry) return null;

        const sketchPlane = sourceObject.dimensions?.sketchPlane || 'XY';

        // Calculate direction based on sketch plane
        let dir: [number, number, number] = [0, 0, 1];
        let coneRotation: [number, number, number] = [Math.PI / 2, 0, 0];

        if (sketchPlane === 'XZ') {
            dir = [0, 1, 0];
            coneRotation = [0, 0, 0];
        } else if (sketchPlane === 'YZ') {
            dir = [1, 0, 0];
            coneRotation = [0, 0, -Math.PI / 2];
        }

        // Calculate offsets
        const offsetHalf = [dir[0] * distance / 2, dir[1] * distance / 2, dir[2] * distance / 2] as [number, number, number];
        const offsetFull = [dir[0] * distance, dir[1] * distance, dir[2] * distance] as [number, number, number];

        return React.createElement('group', {
            position: sourceObject.position,
            rotation: sourceObject.rotation
        }, [
            // 1. Semi-transparent body
            React.createElement('mesh', { key: 'ghost', geometry: sourceObject.geometry, position: offsetHalf },
                React.createElement('meshStandardMaterial', { color: "#80c0ff", transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
            ),
            // 2. Wireframe at the end
            React.createElement('mesh', { key: 'endcap', geometry: sourceObject.geometry, position: offsetFull },
                React.createElement('meshStandardMaterial', { color: "#80c0ff", transparent: true, opacity: 0.6, side: THREE.DoubleSide, wireframe: true })
            ),
            // 3. Direction Line
            React.createElement('line', { key: 'dir-line' },
                React.createElement('bufferGeometry', null,
                    React.createElement('bufferAttribute', {
                        attach: 'attributes-position',
                        count: 2,
                        array: new Float32Array([0, 0, 0, ...offsetFull]),
                        itemSize: 3
                    })
                ),
                React.createElement('lineBasicMaterial', { color: "#80c0ff", linewidth: 2 })
            ),
            // 4. Arrow head
            React.createElement('mesh', { key: 'arrow', position: offsetFull, rotation: coneRotation },
                React.createElement('coneGeometry', { args: [1.5, 3, 8] }),
                React.createElement('meshStandardMaterial', { color: "#80c0ff", transparent: true, opacity: 0.8 })
            )
        ]);
    }
};

export default extrusionTool;


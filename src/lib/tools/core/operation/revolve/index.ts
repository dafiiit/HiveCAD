import React from 'react';
import * as THREE from 'three';
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
    },
    render3DPreview(params, { objects }) {
        const profileId = params.profile;
        const angle = params.angle || 360;

        if (!profileId) return null;

        const sourceObject = objects.find(obj => obj.id === profileId);
        if (!sourceObject || !sourceObject.geometry) return null;

        // Create "ghosts" rotated around the axis
        const steps = 6;
        const ghosts = [];
        const angleRad = (angle * Math.PI) / 180;

        // Determine rotation axis based on sketch plane
        const sketchPlane = sourceObject.dimensions?.sketchPlane || 'XY';
        let axisVec = new THREE.Vector3(0, 1, 0); // Default revolve axis often Y
        if (sketchPlane === 'XZ') axisVec.set(0, 0, 1); // Z

        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const rotAngle = angleRad * t;

            ghosts.push(
                React.createElement('group', {
                    key: i,
                    rotation: [
                        axisVec.x * rotAngle,
                        axisVec.y * rotAngle,
                        axisVec.z * rotAngle
                    ]
                },
                    React.createElement('mesh', { geometry: sourceObject.geometry },
                        React.createElement('meshStandardMaterial', {
                            color: "#80c0ff",
                            transparent: true,
                            opacity: 0.1 + (0.5 * t),
                            side: THREE.DoubleSide,
                            wireframe: i === steps
                        })
                    )
                )
            );
        }

        return React.createElement('group', {
            position: sourceObject.position,
            rotation: sourceObject.rotation
        }, [
            ...ghosts,
            // Axis Line Indicator (Visual only)
            React.createElement('line', { key: 'axis-line' },
                React.createElement('bufferGeometry', null,
                    React.createElement('bufferAttribute', {
                        attach: 'attributes-position',
                        count: 2,
                        array: new Float32Array([
                            -axisVec.x * 50, -axisVec.y * 50, -axisVec.z * 50,
                            axisVec.x * 50, axisVec.y * 50, axisVec.z * 50
                        ]),
                        itemSize: 3
                    })
                ),
                React.createElement('lineBasicMaterial', { color: "#ffaa00", linewidth: 1 })
            )
        ]);
    }
};

export default revolveTool;


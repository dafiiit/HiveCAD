import React from 'react';
import * as THREE from 'three';
import type { CADObject } from '../../../../store/types';

export function renderRevolvePreview(
    params: Record<string, any>,
    context: {
        selectedIds: string[];
        objects: CADObject[];
        updateOperationParams: (params: Record<string, any>) => void;
        setCameraControlsDisabled: (disabled: boolean) => void;
    }
) {
    const { objects } = context;
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
    let axisVec = new THREE.Vector3(0, 1, 0);
    if (sketchPlane === 'XZ') axisVec.set(0, 0, 1);

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
        // Axis Line Indicator
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

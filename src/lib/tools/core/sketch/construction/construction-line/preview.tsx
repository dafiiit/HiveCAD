import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive } from '../../../../types';
import {
    CONSTRUCTION_COLOR,
    CONSTRUCTION_GHOST_COLOR,
    renderDashedLine,
} from '../helpers';

export function renderConstructionLinePreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false,
) {
    const color = isGhost ? CONSTRUCTION_GHOST_COLOR : CONSTRUCTION_COLOR;
    const points = primitive.points.map(p => to3D(p[0], p[1]));
    if (points.length < 2) return null;

    // Include point coordinates in key to force re-render when points change
    const pointsKey = primitive.points.map(p => `${p[0]},${p[1]}`).join('|');

    // Extend the line beyond both endpoints to make it look infinite
    const dir = new THREE.Vector3().subVectors(points[1], points[0]);
    const len = dir.length();
    if (len < 1e-6) return null;
    dir.normalize();
    const ext = 500; // visually "infinite"
    const extStart = points[0].clone().sub(dir.clone().multiplyScalar(ext));
    const extEnd = points[1].clone().add(dir.clone().multiplyScalar(ext));

    return React.createElement('group', { key: `${primitive.id}-${pointsKey}` },
        renderDashedLine(`${primitive.id}-ext-${pointsKey}`, [extStart, extEnd], color),
        // Highlight the user-defined segment
        React.createElement('line', { key: `${primitive.id}-seg-${pointsKey}` },
            React.createElement('bufferGeometry', null,
                React.createElement('bufferAttribute', {
                    attach: 'attributes-position',
                    count: 2,
                    array: new Float32Array(points.flatMap(v => [v.x, v.y, v.z])),
                    itemSize: 3,
                })
            ),
            React.createElement('lineBasicMaterial', { color, linewidth: 2, depthTest: false })
        ),
        // Endpoint markers
        ...points.map((p, i) =>
            React.createElement('mesh', { key: `${primitive.id}-ep${i}-${pointsKey}`, position: p },
                React.createElement('sphereGeometry', { args: [0.15, 8, 8] }),
                React.createElement('meshBasicMaterial', { color: CONSTRUCTION_COLOR, depthTest: false })
            )
        )
    );
}

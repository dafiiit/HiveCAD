import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive } from '../../../../types';
import {
    renderDashedLine,
} from '../../construction/helpers';

export function renderCenterPointArcPreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false,
) {
    const color = isGhost ? '#00ffff' : '#ffff00';
    if (primitive.points.length < 2) return null;

    const center = primitive.points[0];
    const startPt = primitive.points[1];
    const radius = Math.hypot(startPt[0] - center[0], startPt[1] - center[1]);

    if (primitive.points.length === 2) {
        // Show radius line + full circle guide
        const segments = 64;
        const circlePts: THREE.Vector3[] = [];
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            circlePts.push(to3D(
                center[0] + radius * Math.cos(theta),
                center[1] + radius * Math.sin(theta),
            ));
        }
        return React.createElement('group', { key: primitive.id },
            renderDashedLine(`${primitive.id}-guide`, circlePts, '#444488'),
            React.createElement('line', { key: `${primitive.id}-rad` },
                React.createElement('bufferGeometry', null,
                    React.createElement('bufferAttribute', {
                        attach: 'attributes-position',
                        count: 2,
                        array: new Float32Array([
                            ...to3D(center[0], center[1]).toArray(),
                            ...to3D(startPt[0], startPt[1]).toArray(),
                        ]),
                        itemSize: 3,
                    })
                ),
                React.createElement('lineBasicMaterial', { color, linewidth: 2, depthTest: false })
            )
        );
    }

    // 3 points → render the arc sweep
    const endPt = primitive.points[2];
    const startAngle = Math.atan2(startPt[1] - center[1], startPt[0] - center[0]);
    const endAngle = Math.atan2(endPt[1] - center[1], endPt[0] - center[0]);
    let sweep = endAngle - startAngle;
    if (sweep <= 0) sweep += 2 * Math.PI;

    const arcSegments = Math.max(16, Math.round((sweep / (2 * Math.PI)) * 64));
    const arcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= arcSegments; i++) {
        const theta = startAngle + (i / arcSegments) * sweep;
        arcPts.push(to3D(
            center[0] + radius * Math.cos(theta),
            center[1] + radius * Math.sin(theta),
        ));
    }

    return React.createElement('group', { key: primitive.id },
        React.createElement('line', { key: `${primitive.id}-arc` },
            React.createElement('bufferGeometry', null,
                React.createElement('bufferAttribute', {
                    attach: 'attributes-position',
                    count: arcPts.length,
                    array: new Float32Array(arcPts.flatMap(v => [v.x, v.y, v.z])),
                    itemSize: 3,
                })
            ),
            React.createElement('lineBasicMaterial', { color, linewidth: 3, depthTest: false })
        ),
        // Center point marker
        React.createElement('mesh', { key: `${primitive.id}-center`, position: to3D(center[0], center[1]) },
            React.createElement('sphereGeometry', { args: [0.2, 8, 8] }),
            React.createElement('meshBasicMaterial', { color: '#ff00ff', depthTest: false })
        ),
    );
}

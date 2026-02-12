import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive } from '../../../../types';
import { renderLine } from '../helpers';

export function renderSmoothSplinePreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false,
) {
    const color = isGhost ? '#00ffff' : '#ffff00';
    const points = primitive.points.map(p => to3D(p[0], p[1]));
    if (points.length < 2) return null;

    const curve = new THREE.CatmullRomCurve3(points);
    const splinePoints = curve.getPoints(50);

    return React.createElement('group', { key: primitive.id },
        renderLine(`${primitive.id}-curve`, splinePoints, color),
        ...(isGhost ? points.map((p, i) =>
            React.createElement('mesh', { key: `${primitive.id}-pt-${i}`, position: p },
                React.createElement('boxGeometry', { args: [0.3, 0.3, 0.3] }),
                React.createElement('meshBasicMaterial', { color: '#ff00ff', depthTest: false })
            )
        ) : [])
    );
}

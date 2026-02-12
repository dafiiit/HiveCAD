import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive } from '../../../../types';
import { renderLine } from '../helpers';

export function renderBezierPreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false,
) {
    const color = isGhost ? '#00ffff' : '#ffff00';
    const points = primitive.points.map(p => to3D(p[0], p[1]));
    if (points.length < 2) return null;

    const start = points[0];
    const end = points[1];
    const ctrl = points.length > 2 ? points[2] :
        new THREE.Vector3(
            (start.x + end.x) / 2 + 5,
            (start.y + end.y) / 2 + 5,
            (start.z + end.z) / 2,
        );

    const curve = new THREE.QuadraticBezierCurve3(start, ctrl, end);
    const bezierPoints = curve.getPoints(30);

    return React.createElement('group', { key: primitive.id },
        renderLine(`${primitive.id}-curve`, bezierPoints, color),
        React.createElement('mesh', { position: ctrl },
            React.createElement('sphereGeometry', { args: [0.3, 16, 16] }),
            React.createElement('meshBasicMaterial', { color: '#ff8800', depthTest: false })
        )
    );
}

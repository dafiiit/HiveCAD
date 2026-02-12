import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive } from '../../../../types';
import { renderLine } from '../helpers';

export function renderQuadraticBezierPreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false,
) {
    const color = isGhost ? '#00ffff' : '#ffff00';
    const points = primitive.points.map(p => to3D(p[0], p[1]));
    if (points.length < 2) return null;

    const start = points[0];
    const end = points[1];

    const ctrlX = primitive.properties?.ctrlX ?? 5;
    const ctrlY = primitive.properties?.ctrlY ?? 5;
    const ctrlPt2D: [number, number] = [
        primitive.points[0][0] + ctrlX,
        primitive.points[0][1] + ctrlY,
    ];
    const ctrl = to3D(ctrlPt2D[0], ctrlPt2D[1]);

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

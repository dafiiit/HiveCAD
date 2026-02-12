import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive } from '../../../../types';
import { renderLine } from '../helpers';

export function renderCubicBezierPreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false,
) {
    const color = isGhost ? '#00ffff' : '#ffff00';
    if (primitive.points.length < 2) return null;

    const start = to3D(primitive.points[0][0], primitive.points[0][1]);
    const end = to3D(primitive.points[1][0], primitive.points[1][1]);
    const props = primitive.properties || {};
    const ctrl1 = to3D(
        primitive.points[0][0] + (props.ctrlStartX || 3),
        primitive.points[0][1] + (props.ctrlStartY || 5),
    );
    const ctrl2 = to3D(
        primitive.points[1][0] - (props.ctrlEndX || 3),
        primitive.points[1][1] + (props.ctrlEndY || 5),
    );

    const curve = new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end);
    const bezierPoints = curve.getPoints(30);

    return React.createElement('group', { key: primitive.id },
        renderLine(`${primitive.id}-curve`, bezierPoints, color),
        React.createElement('mesh', { position: ctrl1 },
            React.createElement('sphereGeometry', { args: [0.25, 16, 16] }),
            React.createElement('meshBasicMaterial', { color: '#ff8800', depthTest: false })
        ),
        React.createElement('mesh', { position: ctrl2 },
            React.createElement('sphereGeometry', { args: [0.25, 16, 16] }),
            React.createElement('meshBasicMaterial', { color: '#ff8800', depthTest: false })
        )
    );
}

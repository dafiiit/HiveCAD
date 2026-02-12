import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive, SketchPlane } from '../../../../types';
import { CircleAnnotation } from '../../../../../../components/cad/SketchAnnotations';
import { renderLineLoop } from '../helpers';

export function renderCirclePreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false
) {
    const color = isGhost ? "#00ffff" : "#ffff00";
    if (primitive.points.length < 2) return null;

    const center = primitive.points[0];
    const edge = primitive.points[1];
    const dx = edge[0] - center[0];
    const dy = edge[1] - center[1];
    const radius = Math.sqrt(dx * dx + dy * dy);

    const segments = 64;
    const circlePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const x = center[0] + Math.cos(theta) * radius;
        const y = center[1] + Math.sin(theta) * radius;
        circlePoints.push(to3D(x, y));
    }

    return renderLineLoop(primitive.id, circlePoints, color);
}

export function renderCircleAnnotation(
    primitive: SketchPrimitive,
    plane: SketchPlane
) {
    if (primitive.points.length < 2) return null;
    const center = { x: primitive.points[0][0], y: primitive.points[0][1] };
    const edge = { x: primitive.points[1][0], y: primitive.points[1][1] };
    return React.createElement(CircleAnnotation, {
        key: `${primitive.id}-annotation`,
        center,
        edge,
        plane
    });
}

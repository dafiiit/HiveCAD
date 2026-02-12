import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive, SketchPlane } from '../../../../types';
import { RectangleAnnotation } from '../../../../../../components/cad/SketchAnnotations';
import { renderLineLoop } from '../helpers';

export function renderRectanglePreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false
) {
    const color = isGhost ? "#00ffff" : "#ffff00";
    if (primitive.points.length < 2) return null;
    const u1 = primitive.points[0];
    const u2 = primitive.points[1];
    const rectPoints2D: [number, number][] = [u1, [u2[0], u1[1]], u2, [u1[0], u2[1]], u1];
    const displayPoints = rectPoints2D.map(p => to3D(p[0], p[1]));
    return renderLineLoop(primitive.id, displayPoints, color);
}

export function renderRectangleAnnotation(
    primitive: SketchPrimitive,
    plane: SketchPlane,
    lockedValues?: Record<string, number | null>
) {
    if (primitive.points.length < 2) return null;
    const corner1 = { x: primitive.points[0][0], y: primitive.points[0][1] };
    const corner2 = { x: primitive.points[1][0], y: primitive.points[1][1] };
    return React.createElement(RectangleAnnotation, {
        key: `${primitive.id}-annotation`,
        corner1,
        corner2,
        plane
    });
}

import * as THREE from 'three';
import type { SketchPrimitive } from '../../../../types';
import { renderLineLoop } from '../helpers';

export function renderPolygonPreview(
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
    const sides = primitive.properties?.sides || 6;
    const startAngle = Math.atan2(dy, dx);

    const polyPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= sides; i++) {
        const theta = startAngle + (i / sides) * Math.PI * 2;
        const x = center[0] + Math.cos(theta) * radius;
        const y = center[1] + Math.sin(theta) * radius;
        polyPoints.push(to3D(x, y));
    }

    return renderLineLoop(primitive.id, polyPoints, color);
}

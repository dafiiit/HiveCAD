import * as THREE from 'three';
import type { SketchPrimitive, SketchPlane } from '../../../../types';
import { renderLineLoop } from '../helpers';

export function renderEllipsePreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false
) {
    const color = isGhost ? "#00ffff" : "#ffff00";
    if (primitive.points.length < 2) return null;

    const center = primitive.points[0];
    const edge = primitive.points[1];
    const rx = Math.abs(edge[0] - center[0]) || 0.01;
    const ry = Math.abs(edge[1] - center[1]) || 0.01;

    const segments = 64;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        pts.push(to3D(
            center[0] + rx * Math.cos(theta),
            center[1] + ry * Math.sin(theta)
        ));
    }

    return renderLineLoop(primitive.id, pts, color);
}

export function renderEllipseAnnotation(
    primitive: SketchPrimitive,
    plane: SketchPlane,
    lockedValues?: Record<string, number | null>
) {
    if (primitive.points.length < 2) return null;
    // Ellipse annotation: radii are shown via the preview shape itself.
    // A proper annotation with dimension lines for X/Y radii is deferred
    // until a dedicated EllipseAnnotation component is available.
    return null;
}

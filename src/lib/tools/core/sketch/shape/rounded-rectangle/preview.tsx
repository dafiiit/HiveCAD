import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive } from '../../../../types';
import { renderLineLoop } from '../helpers';
import { renderRectanglePreview } from '../rectangle/preview';

export function renderRoundedRectanglePreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false
) {
    const color = isGhost ? "#00ffff" : "#ffff00";
    if (primitive.points.length < 2) return null;

    const [p1, p2] = primitive.points;
    const minX = Math.min(p1[0], p2[0]);
    const maxX = Math.max(p1[0], p2[0]);
    const minY = Math.min(p1[1], p2[1]);
    const maxY = Math.max(p1[1], p2[1]);

    const w = maxX - minX;
    const h = maxY - minY;
    const r = Math.min(primitive.properties?.radius || 3, w / 2, h / 2);

    if (r < 0.01) {
        return renderRectanglePreview(primitive, to3D, isGhost);
    }

    const arcSegments = 8;
    const pts: [number, number][] = [];

    // Bottom-right corner
    for (let i = 0; i <= arcSegments; i++) {
        const a = -Math.PI / 2 + (Math.PI / 2) * (i / arcSegments);
        pts.push([maxX - r + r * Math.cos(a), minY + r + r * Math.sin(a)]);
    }
    // Top-right corner
    for (let i = 0; i <= arcSegments; i++) {
        const a = 0 + (Math.PI / 2) * (i / arcSegments);
        pts.push([maxX - r + r * Math.cos(a), maxY - r + r * Math.sin(a)]);
    }
    // Top-left corner
    for (let i = 0; i <= arcSegments; i++) {
        const a = Math.PI / 2 + (Math.PI / 2) * (i / arcSegments);
        pts.push([minX + r + r * Math.cos(a), maxY - r + r * Math.sin(a)]);
    }
    // Bottom-left corner
    for (let i = 0; i <= arcSegments; i++) {
        const a = Math.PI + (Math.PI / 2) * (i / arcSegments);
        pts.push([minX + r + r * Math.cos(a), minY + r + r * Math.sin(a)]);
    }
    // Close
    pts.push(pts[0]);

    const displayPoints = pts.map(p => to3D(p[0], p[1]));
    return renderLineLoop(primitive.id, displayPoints, color);
}

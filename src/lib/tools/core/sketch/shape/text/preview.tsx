import React from 'react';
import * as THREE from 'three';
import type { SketchPrimitive } from '../../../../types';

export function renderTextPreview(
    primitive: SketchPrimitive,
    to3D: (x: number, y: number) => THREE.Vector3,
    isGhost: boolean = false,
) {
    if (primitive.points.length < 1) return null;
    const color = isGhost ? '#00ffff' : '#ffff00';
    const pos = to3D(primitive.points[0][0], primitive.points[0][1]);
    // Show a marker at the text placement point
    return React.createElement('mesh', { key: primitive.id, position: pos },
        React.createElement('boxGeometry', { args: [1, 1, 0.1] }),
        React.createElement('meshBasicMaterial', { color, transparent: true, opacity: 0.6, depthTest: false })
    );
}

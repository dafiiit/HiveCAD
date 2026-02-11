import React from 'react';
import * as THREE from 'three';

/**
 * Helper function to render a line from points.
 * Shared across spline tools for curve preview rendering.
 */
export const renderLine = (
    key: string,
    points: THREE.Vector3[],
    color: string,
) => {
    if (points.length < 2) return null;
    return React.createElement('line', { key },
        React.createElement('bufferGeometry', null,
            React.createElement('bufferAttribute', {
                attach: 'attributes-position',
                count: points.length,
                array: new Float32Array(points.flatMap(v => [v.x, v.y, v.z])),
                itemSize: 3,
            })
        ),
        React.createElement('lineBasicMaterial', { color, linewidth: 3, depthTest: false })
    );
};

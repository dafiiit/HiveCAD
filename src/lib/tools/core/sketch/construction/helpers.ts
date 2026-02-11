import React from 'react';
import * as THREE from 'three';

/**
 * Helper function to render a dashed line from points.
 * Shared across construction tools for reference geometry rendering.
 */
export const CONSTRUCTION_COLOR = '#4488ff';
export const CONSTRUCTION_GHOST_COLOR = '#2244aa';

export const renderDashedLine = (
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
        React.createElement('lineDashedMaterial', {
            color,
            dashSize: 0.8,
            gapSize: 0.4,
            linewidth: 1,
            depthTest: false,
        })
    );
};

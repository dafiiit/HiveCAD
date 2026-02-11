import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import { generateToolId } from '../../../../types';
import {
    CONSTRUCTION_COLOR,
    CONSTRUCTION_GHOST_COLOR,
    renderDashedLine,
} from '../helpers';

export const constructionLineTool: Tool = {
    metadata: {
        id: 'constructionLine',
        label: 'Construction Line',
        icon: 'Ruler',
        category: 'sketch',
        group: 'Construction',
        description: 'Draw a construction line (reference only, not part of profile)',
    },
    uiProperties: [],
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'constructionLine', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'constructionLine',
            points: [startPoint, startPoint],
            properties: properties || {},
        };
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false,
    ) {
        const color = isGhost ? CONSTRUCTION_GHOST_COLOR : CONSTRUCTION_COLOR;
        const points = primitive.points.map(p => to3D(p[0], p[1]));
        if (points.length < 2) return null;

        // Extend the line beyond both endpoints to make it look infinite
        const dir = new THREE.Vector3().subVectors(points[1], points[0]);
        const len = dir.length();
        if (len < 1e-6) return null;
        dir.normalize();
        const ext = 500; // visually "infinite"
        const extStart = points[0].clone().sub(dir.clone().multiplyScalar(ext));
        const extEnd = points[1].clone().add(dir.clone().multiplyScalar(ext));

        return React.createElement('group', { key: primitive.id },
            renderDashedLine(`${primitive.id}-ext`, [extStart, extEnd], color),
            // Highlight the user-defined segment
            React.createElement('line', { key: `${primitive.id}-seg` },
                React.createElement('bufferGeometry', null,
                    React.createElement('bufferAttribute', {
                        attach: 'attributes-position',
                        count: 2,
                        array: new Float32Array(points.flatMap(v => [v.x, v.y, v.z])),
                        itemSize: 3,
                    })
                ),
                React.createElement('lineBasicMaterial', { color, linewidth: 2, depthTest: false })
            ),
            // Endpoint markers
            ...points.map((p, i) =>
                React.createElement('mesh', { key: `${primitive.id}-ep${i}`, position: p },
                    React.createElement('sphereGeometry', { args: [0.15, 8, 8] }),
                    React.createElement('meshBasicMaterial', { color: CONSTRUCTION_COLOR, depthTest: false })
                )
            )
        );
    },
};

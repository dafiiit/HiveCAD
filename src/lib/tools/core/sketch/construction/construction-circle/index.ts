import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import { generateToolId } from '../../../../types';
import {
    CONSTRUCTION_COLOR,
    CONSTRUCTION_GHOST_COLOR,
    renderDashedLine,
} from '../helpers';

export const constructionCircleTool: Tool = {
    metadata: {
        id: 'constructionCircle',
        label: 'Construction Circle',
        icon: 'CircleDot',
        category: 'sketch',
        group: 'Construction',
        description: 'Draw a construction circle (reference only)',
    },
    uiProperties: [],
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'constructionCircle', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'constructionCircle',
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
        if (primitive.points.length < 2) return null;

        const center = primitive.points[0];
        const edge = primitive.points[1];
        const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);

        const segments = 64;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            pts.push(to3D(
                center[0] + radius * Math.cos(theta),
                center[1] + radius * Math.sin(theta),
            ));
        }

        return React.createElement('group', { key: primitive.id },
            renderDashedLine(primitive.id + '-circ', pts, color),
            // Center marker
            React.createElement('mesh', { key: `${primitive.id}-center`, position: to3D(center[0], center[1]) },
                React.createElement('sphereGeometry', { args: [0.15, 8, 8] }),
                React.createElement('meshBasicMaterial', { color: CONSTRUCTION_COLOR, depthTest: false })
            )
        );
    },
};

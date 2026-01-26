import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../types';
import type { CodeManager } from '../../code-manager';
import { generateToolId } from '../types';
import { LineAnnotation } from '../../../components/cad/SketchAnnotations';

export const lineTool: Tool = {
    metadata: {
        id: 'line',
        label: 'Line',
        icon: 'Minus',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a line between points'
    },
    uiProperties: [],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        // For multi-point lines, add each segment
        for (let i = 1; i < primitive.points.length; i++) {
            const pt = primitive.points[i];
            codeManager.addOperation(sketchName, 'lineTo', [[pt[0], pt[1]]]);
        }
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'line', points };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'line',
            points: [startPoint, startPoint],
            properties: properties || {}
        };
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false
    ) {
        const color = isGhost ? "#00ffff" : "#ffff00";
        const points = primitive.points.map(p => to3D(p[0], p[1]));
        if (points.length < 2) return null;

        return React.createElement('line', { key: primitive.id },
            React.createElement('bufferGeometry', null,
                React.createElement('bufferAttribute', {
                    attach: 'attributes-position',
                    count: points.length,
                    array: new Float32Array(points.flatMap(v => [v.x, v.y, v.z])),
                    itemSize: 3
                })
            ),
            React.createElement('lineBasicMaterial', { color, linewidth: 3, depthTest: false })
        );
    },
    renderAnnotation(
        primitive: SketchPrimitive,
        plane: SketchPlane,
        lockedValues?: Record<string, number | null>,
        dimMode?: 'aligned' | 'horizontal' | 'vertical'
    ) {
        if (primitive.points.length < 2) return null;
        const start = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const end = { x: primitive.points[1][0], y: primitive.points[1][1] };
        return React.createElement(LineAnnotation, {
            key: `${primitive.id}-annotation`,
            start,
            end,
            plane,
            lockedLength: lockedValues?.length ?? null,
            lockedAngle: lockedValues?.angle ?? null,
            dimMode
        });
    }
};



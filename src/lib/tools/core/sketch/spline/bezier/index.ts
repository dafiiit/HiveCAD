import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderLine } from '../helpers';

export const bezierTool: Tool = {
    metadata: {
        id: 'bezier',
        label: 'Bezier Curve',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a Bezier curve with control points',
    },
    uiProperties: [],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const p1 = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const p2 = { x: primitive.points[1][0], y: primitive.points[1][1] };
        return [new LineSegment(p1, p2)];
    },
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const end = primitive.points[1];
        const controlPoints = primitive.points.slice(2).map(p => [p[0], p[1]]);
        codeManager.addOperation(sketchName, 'bezierCurveTo', [[end[0], end[1]], controlPoints]);
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'bezier', points };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        const ctrlX = properties?.ctrlX ?? startPoint[0] + 5;
        const ctrlY = properties?.ctrlY ?? startPoint[1] + 5;
        return {
            id: generateToolId(),
            type: 'bezier',
            points: [startPoint, startPoint, [ctrlX, ctrlY]],
            properties: properties || {},
        };
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false,
    ) {
        const color = isGhost ? '#00ffff' : '#ffff00';
        const points = primitive.points.map(p => to3D(p[0], p[1]));
        if (points.length < 2) return null;

        const start = points[0];
        const end = points[1];
        const ctrl = points.length > 2 ? points[2] :
            new THREE.Vector3(
                (start.x + end.x) / 2 + 5,
                (start.y + end.y) / 2 + 5,
                (start.z + end.z) / 2,
            );

        const curve = new THREE.QuadraticBezierCurve3(start, ctrl, end);
        const bezierPoints = curve.getPoints(30);

        return React.createElement('group', { key: primitive.id },
            renderLine(`${primitive.id}-curve`, bezierPoints, color),
            React.createElement('mesh', { position: ctrl },
                React.createElement('sphereGeometry', { args: [0.3, 16, 16] }),
                React.createElement('meshBasicMaterial', { color: '#ff8800', depthTest: false })
            )
        );
    },
};

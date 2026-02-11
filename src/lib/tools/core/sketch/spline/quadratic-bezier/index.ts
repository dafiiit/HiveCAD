import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderLine } from '../helpers';

export const quadraticBezierTool: Tool = {
    metadata: {
        id: 'quadraticBezier',
        label: 'Quadratic Bezier',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a quadratic Bezier curve',
    },
    uiProperties: [
        { key: 'ctrlX', label: 'Control X', type: 'number', default: 5, unit: 'mm' },
        { key: 'ctrlY', label: 'Control Y', type: 'number', default: 5, unit: 'mm' },
    ],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const p1 = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const p2 = { x: primitive.points[1][0], y: primitive.points[1][1] };
        return [new LineSegment(p1, p2)];
    },
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const end = primitive.points[1];
        const ctrlX = primitive.properties?.ctrlX || 5;
        const ctrlY = primitive.properties?.ctrlY || 5;
        const start = primitive.points[0];
        const ctrl = [start[0] + ctrlX, start[1] + ctrlY];
        codeManager.addOperation(sketchName, 'quadraticBezierCurveTo', [[end[0], end[1]], ctrl]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'quadraticBezier', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'quadraticBezier',
            points: [startPoint, startPoint],
            properties: { ctrlX: properties?.ctrlX || 5, ctrlY: properties?.ctrlY || 5, ...properties },
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

        const ctrlX = primitive.properties?.ctrlX ?? 5;
        const ctrlY = primitive.properties?.ctrlY ?? 5;
        const ctrlPt2D: [number, number] = [
            primitive.points[0][0] + ctrlX,
            primitive.points[0][1] + ctrlY,
        ];
        const ctrl = to3D(ctrlPt2D[0], ctrlPt2D[1]);

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

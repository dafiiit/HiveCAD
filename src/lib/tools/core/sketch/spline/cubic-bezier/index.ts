import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderLine } from '../helpers';

export const cubicBezierTool: Tool = {
    metadata: {
        id: 'cubicBezier',
        label: 'Cubic Bezier',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a cubic Bezier curve',
    },
    uiProperties: [
        { key: 'ctrlStartX', label: 'Control Start X', type: 'number', default: 3, unit: 'mm' },
        { key: 'ctrlStartY', label: 'Control Start Y', type: 'number', default: 5, unit: 'mm' },
        { key: 'ctrlEndX', label: 'Control End X', type: 'number', default: 3, unit: 'mm' },
        { key: 'ctrlEndY', label: 'Control End Y', type: 'number', default: 5, unit: 'mm' },
    ],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const p1 = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const p2 = { x: primitive.points[1][0], y: primitive.points[1][1] };
        return [new LineSegment(p1, p2)];
    },
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const start = primitive.points[0];
        const end = primitive.points[1];
        const ctrlStartX = primitive.properties?.ctrlStartX || 3;
        const ctrlStartY = primitive.properties?.ctrlStartY || 5;
        const ctrlEndX = primitive.properties?.ctrlEndX || 3;
        const ctrlEndY = primitive.properties?.ctrlEndY || 5;
        const ctrlStart = [start[0] + ctrlStartX, start[1] + ctrlStartY];
        const ctrlEnd = [end[0] - ctrlEndX, end[1] + ctrlEndY];
        codeManager.addOperation(sketchName, 'cubicBezierCurveTo', [[end[0], end[1]], ctrlStart, ctrlEnd]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'cubicBezier', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'cubicBezier',
            points: [startPoint, startPoint],
            properties: {
                ctrlStartX: properties?.ctrlStartX || 3,
                ctrlStartY: properties?.ctrlStartY || 5,
                ctrlEndX: properties?.ctrlEndX || 3,
                ctrlEndY: properties?.ctrlEndY || 5,
                ...properties,
            },
        };
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false,
    ) {
        const color = isGhost ? '#00ffff' : '#ffff00';
        if (primitive.points.length < 2) return null;

        const start = to3D(primitive.points[0][0], primitive.points[0][1]);
        const end = to3D(primitive.points[1][0], primitive.points[1][1]);
        const props = primitive.properties || {};
        const ctrl1 = to3D(
            primitive.points[0][0] + (props.ctrlStartX || 3),
            primitive.points[0][1] + (props.ctrlStartY || 5),
        );
        const ctrl2 = to3D(
            primitive.points[1][0] - (props.ctrlEndX || 3),
            primitive.points[1][1] + (props.ctrlEndY || 5),
        );

        const curve = new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end);
        const bezierPoints = curve.getPoints(30);

        return React.createElement('group', { key: primitive.id },
            renderLine(`${primitive.id}-curve`, bezierPoints, color),
            React.createElement('mesh', { position: ctrl1 },
                React.createElement('sphereGeometry', { args: [0.25, 16, 16] }),
                React.createElement('meshBasicMaterial', { color: '#ff8800', depthTest: false })
            ),
            React.createElement('mesh', { position: ctrl2 },
                React.createElement('sphereGeometry', { args: [0.25, 16, 16] }),
                React.createElement('meshBasicMaterial', { color: '#ff8800', depthTest: false })
            )
        );
    },
};

import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../types';
import type { CodeManager } from '../../../../code-manager';
import { generateToolId } from '../../../types';
import { LineSegment } from '../../../../sketch-graph/Geometry';

// Helper to render a line from points
const renderLine = (
    key: string,
    points: THREE.Vector3[],
    color: string
) => {
    if (points.length < 2) return null;
    return React.createElement('line', { key },
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
};

export const smoothSplineTool: Tool = {
    metadata: {
        id: 'smoothSpline',
        label: 'Smooth Spline',
        icon: 'Spline',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a smooth spline curve through points'
    },
    uiProperties: [
        { key: 'startTangent', label: 'Start Tangent', type: 'number', default: 0, unit: 'deg' },
        { key: 'endTangent', label: 'End Tangent', type: 'number', default: 0, unit: 'deg' }
    ],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const geoms = [];
        for (let i = 0; i < primitive.points.length - 1; i++) {
            const p1 = { x: primitive.points[i][0], y: primitive.points[i][1] };
            const p2 = { x: primitive.points[i + 1][0], y: primitive.points[i + 1][1] };
            geoms.push(new LineSegment(p1, p2));
        }
        return geoms;
    },
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        for (let i = 1; i < primitive.points.length; i++) {
            const pt = primitive.points[i];
            const config: Record<string, any> = {};
            if (primitive.properties?.startTangent !== undefined && i === 1) {
                config.startTangent = primitive.properties.startTangent;
            }
            if (primitive.properties?.endTangent !== undefined && i === primitive.points.length - 1) {
                config.endTangent = primitive.properties.endTangent;
            }
            if (Object.keys(config).length > 0) {
                codeManager.addOperation(sketchName, 'smoothSplineTo', [[pt[0], pt[1]], config]);
            } else {
                codeManager.addOperation(sketchName, 'smoothSplineTo', [[pt[0], pt[1]]]);
            }
        }
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'smoothSpline', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'smoothSpline',
            points: [startPoint, startPoint],
            properties: {
                startTangent: properties?.startTangent,
                endTangent: properties?.endTangent,
                ...properties
            }
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

        const curve = new THREE.CatmullRomCurve3(points);
        const splinePoints = curve.getPoints(50);

        // Render spline curve with control point markers
        return React.createElement('group', { key: primitive.id },
            renderLine(`${primitive.id}-curve`, splinePoints, color),
            ...(isGhost ? points.map((p, i) =>
                React.createElement('mesh', { key: `${primitive.id}-pt-${i}`, position: p },
                    React.createElement('boxGeometry', { args: [0.3, 0.3, 0.3] }),
                    React.createElement('meshBasicMaterial', { color: '#ff00ff', depthTest: false })
                )
            ) : [])
        );
    }
};

export const bezierTool: Tool = {
    metadata: {
        id: 'bezier',
        label: 'Bezier Curve',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a Bezier curve with control points'
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

        const start = points[0];
        const end = points[1];
        const ctrl = points.length > 2 ? points[2] :
            new THREE.Vector3(
                (start.x + end.x) / 2 + 5,
                (start.y + end.y) / 2 + 5,
                (start.z + end.z) / 2
            );

        const curve = new THREE.QuadraticBezierCurve3(start, ctrl, end);
        const bezierPoints = curve.getPoints(30);

        return React.createElement('group', { key: primitive.id },
            renderLine(`${primitive.id}-curve`, bezierPoints, color),
            // Control point marker
            React.createElement('mesh', { position: ctrl },
                React.createElement('sphereGeometry', { args: [0.3, 16, 16] }),
                React.createElement('meshBasicMaterial', { color: '#ff8800', depthTest: false })
            )
        );
    }
};

export const quadraticBezierTool: Tool = {
    metadata: {
        id: 'quadraticBezier',
        label: 'Quadratic Bezier',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a quadratic Bezier curve'
    },
    uiProperties: [
        { key: 'ctrlX', label: 'Control X', type: 'number', default: 5, unit: 'mm' },
        { key: 'ctrlY', label: 'Control Y', type: 'number', default: 5, unit: 'mm' }
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
            properties: { ctrlX: properties?.ctrlX || 5, ctrlY: properties?.ctrlY || 5, ...properties }
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

        const start = points[0];
        const end = points[1];

        // Compute control point from ctrlX/ctrlY offsets relative to start
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
    }
};

export const cubicBezierTool: Tool = {
    metadata: {
        id: 'cubicBezier',
        label: 'Cubic Bezier',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a cubic Bezier curve'
    },
    uiProperties: [
        { key: 'ctrlStartX', label: 'Control Start X', type: 'number', default: 3, unit: 'mm' },
        { key: 'ctrlStartY', label: 'Control Start Y', type: 'number', default: 5, unit: 'mm' },
        { key: 'ctrlEndX', label: 'Control End X', type: 'number', default: 3, unit: 'mm' },
        { key: 'ctrlEndY', label: 'Control End Y', type: 'number', default: 5, unit: 'mm' }
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
                ...properties
            }
        };
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false
    ) {
        const color = isGhost ? "#00ffff" : "#ffff00";
        if (primitive.points.length < 2) return null;

        const start = to3D(primitive.points[0][0], primitive.points[0][1]);
        const end = to3D(primitive.points[1][0], primitive.points[1][1]);
        const props = primitive.properties || {};
        const ctrl1 = to3D(
            primitive.points[0][0] + (props.ctrlStartX || 3),
            primitive.points[0][1] + (props.ctrlStartY || 5)
        );
        const ctrl2 = to3D(
            primitive.points[1][0] - (props.ctrlEndX || 3),
            primitive.points[1][1] + (props.ctrlEndY || 5)
        );

        const curve = new THREE.CubicBezierCurve3(start, ctrl1, ctrl2, end);
        const bezierPoints = curve.getPoints(30);

        return React.createElement('group', { key: primitive.id },
            renderLine(`${primitive.id}-curve`, bezierPoints, color),
            // Control point markers
            React.createElement('mesh', { position: ctrl1 },
                React.createElement('sphereGeometry', { args: [0.25, 16, 16] }),
                React.createElement('meshBasicMaterial', { color: '#ff8800', depthTest: false })
            ),
            React.createElement('mesh', { position: ctrl2 },
                React.createElement('sphereGeometry', { args: [0.25, 16, 16] }),
                React.createElement('meshBasicMaterial', { color: '#ff8800', depthTest: false })
            )
        );
    }
};

import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../types';
import { arcFromThreePoints } from '../../sketch-graph/Geometry';
import type { CodeManager } from '../../code-manager';
import { generateToolId } from '../types';

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

export const threePointsArcTool: Tool = {
    metadata: {
        id: 'threePointsArc',
        label: '3-Point Arc',
        icon: 'ArrowUpRight',
        category: 'sketch',
        group: 'Arc',
        description: 'Draw an arc through three points'
    },
    uiProperties: [],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        // points: [start, end, via]
        if (primitive.points.length >= 3) {
            const end = primitive.points[1];
            const via = primitive.points[2];
            codeManager.addOperation(sketchName, 'threePointsArcTo', [[end[0], end[1]], [via[0], via[1]]]);
        }
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'threePointsArc', points };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'threePointsArc',
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

        if (points.length === 2) {
            // Draw line for preview until third point
            return renderLine(primitive.id, points, color);
        }

        if (points.length >= 3) {
            const p1 = { x: primitive.points[0][0], y: primitive.points[0][1] };
            const p2 = { x: primitive.points[1][0], y: primitive.points[1][1] };
            const p3 = { x: primitive.points[2][0], y: primitive.points[2][1] };

            // Synchronous call to geometry helper
            const arc = arcFromThreePoints(p1, p2, p3);

            if (arc) {
                const curve = new THREE.EllipseCurve(
                    arc.center.x, arc.center.y,
                    arc.radius, arc.radius,
                    arc.startAngle, arc.endAngle,
                    !arc.ccw, 0
                );
                const arcPoints = curve.getPoints(50).map(p => to3D(p.x, p.y));
                return renderLine(primitive.id, arcPoints, color);
            }

            // Fallback for collinear or invalid
            return renderLine(primitive.id, points.slice(0, 2), color);
        }

        return null;
    },
    renderAnnotation(
        primitive: SketchPrimitive,
        plane: SketchPlane,
    ) {
        if (primitive.points.length < 3) return null;

        const p1 = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const p2 = { x: primitive.points[1][0], y: primitive.points[1][1] };
        const p3 = { x: primitive.points[2][0], y: primitive.points[2][1] };

        const arc = arcFromThreePoints(p1, p2, p3);
        if (!arc) return null;

        const { ArcAnnotation } = require('../../../components/cad/SketchAnnotations');
        return React.createElement(ArcAnnotation, {
            key: `${primitive.id}-annotation`,
            center: arc.center,
            start: p1,
            end: p2,
            radius: arc.radius,
            startAngle: arc.startAngle,
            endAngle: arc.endAngle,
            plane
        });
    }
};

export const tangentArcTool: Tool = {
    metadata: {
        id: 'tangentArc',
        label: 'Tangent Arc',
        icon: 'Rotate3D',
        category: 'sketch',
        group: 'Arc',
        description: 'Draw an arc tangent to the previous segment'
    },
    uiProperties: [],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const end = primitive.points[1];
        codeManager.addOperation(sketchName, 'tangentArcTo', [[end[0], end[1]]]);
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'tangentArc', points };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'tangentArc',
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

        // Simple line preview for tangent arc
        return renderLine(primitive.id, points, color);
    }
};

export const sagittaArcTool: Tool = {
    metadata: {
        id: 'sagittaArc',
        label: 'Sagitta Arc',
        icon: 'CurveStepDown',
        category: 'sketch',
        group: 'Arc',
        description: 'Draw an arc with sagitta (bulge) parameter'
    },
    uiProperties: [
        { key: 'sagitta', label: 'Sagitta', type: 'number', default: 3, unit: 'mm' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const start = primitive.points[0];
        const end = primitive.points[1];
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const sagitta = primitive.properties?.sagitta || 3;
        codeManager.addOperation(sketchName, 'sagittaArc', [dx, dy, sagitta]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'sagittaArc', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'sagittaArc',
            points: [startPoint, startPoint],
            properties: { sagitta: properties?.sagitta || 3, ...properties }
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

        // Simple line preview (sagitta arc is complex without actual curve)
        return renderLine(primitive.id, points, color);
    }
};

export const ellipseTool: Tool = {
    metadata: {
        id: 'ellipse',
        label: 'Ellipse',
        icon: 'Circle',
        category: 'sketch',
        group: 'Arc',
        description: 'Draw an elliptical arc'
    },
    uiProperties: [
        { key: 'xRadius', label: 'X Radius', type: 'number', default: 10, unit: 'mm' },
        { key: 'yRadius', label: 'Y Radius', type: 'number', default: 5, unit: 'mm' },
        { key: 'rotation', label: 'Rotation', type: 'number', default: 0, unit: 'deg' },
        { key: 'longWay', label: 'Long Way', type: 'boolean', default: false },
        { key: 'counterClockwise', label: 'Counter-clockwise', type: 'boolean', default: false }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const end = primitive.points[1];
        const xRadius = primitive.properties?.xRadius || 10;
        const yRadius = primitive.properties?.yRadius || 5;
        const rotation = primitive.properties?.rotation || 0;
        const longWay = primitive.properties?.longWay || false;
        const counterClockwise = primitive.properties?.counterClockwise || false;
        codeManager.addOperation(sketchName, 'ellipseTo', [[end[0], end[1]], xRadius, yRadius, rotation, longWay, counterClockwise]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'ellipse', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'ellipse',
            points: [startPoint, startPoint],
            properties: {
                xRadius: properties?.xRadius || 10,
                yRadius: properties?.yRadius || 5,
                rotation: properties?.rotation || 0,
                longWay: properties?.longWay || false,
                counterClockwise: properties?.counterClockwise || false,
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

        const startPt = primitive.points[0];
        const endPt = primitive.points[1];
        const xRadius = primitive.properties?.xRadius || 10;
        const yRadius = primitive.properties?.yRadius || 5;
        const segments = 64;
        const ellipsePoints: THREE.Vector3[] = [];

        // Simple ellipse approximation centered between start and end
        const cx = (startPt[0] + endPt[0]) / 2;
        const cy = (startPt[1] + endPt[1]) / 2;

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const x = cx + Math.cos(theta) * xRadius;
            const y = cy + Math.sin(theta) * yRadius;
            ellipsePoints.push(to3D(x, y));
        }

        return renderLine(primitive.id, ellipsePoints, color);
    }
};

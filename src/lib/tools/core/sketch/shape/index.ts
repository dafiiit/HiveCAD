import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../../../types';
import type { CodeManager } from '../../../../code-manager';
import { generateToolId } from '../../../types';
import { CircleAnnotation, RectangleAnnotation } from '../../../../../components/cad/SketchAnnotations';

// Helper function to render a line loop from points
const renderLineLoop = (
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

export const rectangleTool: Tool = {
    metadata: {
        id: 'rectangle',
        label: 'Rectangle',
        icon: 'RectangleHorizontal',
        category: 'sketch',
        group: 'Shape',
        description: 'Draw a rectangle'
    },
    uiProperties: [],
    createShape(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string {
        const [p1, p2] = primitive.points;
        const width = Math.abs(p2[0] - p1[0]);
        const height = Math.abs(p2[1] - p1[1]);
        const sketchName = codeManager.addFeature('drawRectangle', null, [width, height]);
        const centerX = (p1[0] + p2[0]) / 2;
        const centerY = (p1[1] + p2[1]) / 2;
        if (centerX !== 0 || centerY !== 0) {
            codeManager.addOperation(sketchName, 'translate', [centerX, centerY]);
        }
        codeManager.addOperation(sketchName, 'sketchOnPlane', [plane]);
        return sketchName;
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'rectangle', points };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'rectangle',
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
        if (primitive.points.length < 2) return null;
        const u1 = primitive.points[0];
        const u2 = primitive.points[1];
        const rectPoints2D: [number, number][] = [u1, [u2[0], u1[1]], u2, [u1[0], u2[1]], u1];
        const displayPoints = rectPoints2D.map(p => to3D(p[0], p[1]));
        return renderLineLoop(primitive.id, displayPoints, color);
    },
    renderAnnotation(
        primitive: SketchPrimitive,
        plane: SketchPlane,
        lockedValues?: Record<string, number | null>
    ) {
        if (primitive.points.length < 2) return null;
        const corner1 = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const corner2 = { x: primitive.points[1][0], y: primitive.points[1][1] };
        return React.createElement(RectangleAnnotation, {
            key: `${primitive.id}-annotation`,
            corner1,
            corner2,
            plane
        });
    }
};

export const roundedRectangleTool: Tool = {
    metadata: {
        id: 'roundedRectangle',
        label: 'Rounded Rectangle',
        icon: 'RectangleHorizontal',
        category: 'sketch',
        group: 'Shape',
        description: 'Draw a rectangle with rounded corners'
    },
    uiProperties: [
        { key: 'radius', label: 'Corner Radius', type: 'number', default: 3, unit: 'mm', min: 0 }
    ],
    createShape(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string {
        const [p1, p2] = primitive.points;
        const width = Math.abs(p2[0] - p1[0]);
        const height = Math.abs(p2[1] - p1[1]);
        const radius = primitive.properties?.radius || 3;
        const sketchName = codeManager.addFeature('drawRoundedRectangle', null, [width, height, radius]);
        const centerX = (p1[0] + p2[0]) / 2;
        const centerY = (p1[1] + p2[1]) / 2;
        if (centerX !== 0 || centerY !== 0) {
            codeManager.addOperation(sketchName, 'translate', [centerX, centerY]);
        }
        codeManager.addOperation(sketchName, 'sketchOnPlane', [plane]);
        return sketchName;
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'roundedRectangle', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'roundedRectangle',
            points: [startPoint, startPoint],
            properties: { radius: properties?.radius || 3, ...properties }
        };
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false
    ) {
        // Same as rectangle for now, rounded corners are complex to preview
        return rectangleTool.renderPreview?.(primitive, to3D, isGhost) ?? null;
    }
};

export const circleTool: Tool = {
    metadata: {
        id: 'circle',
        label: 'Circle',
        icon: 'Circle',
        category: 'sketch',
        group: 'Shape',
        description: 'Draw a circle'
    },
    uiProperties: [],
    createShape(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string {
        const [center, edge] = primitive.points;
        const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
        const sketchName = codeManager.addFeature('drawCircle', null, [radius]);
        if (center[0] !== 0 || center[1] !== 0) {
            codeManager.addOperation(sketchName, 'translate', [center[0], center[1]]);
        }
        codeManager.addOperation(sketchName, 'sketchOnPlane', [plane]);
        return sketchName;
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'circle', points };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'circle',
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
        if (primitive.points.length < 2) return null;

        const center = primitive.points[0];
        const edge = primitive.points[1];
        const dx = edge[0] - center[0];
        const dy = edge[1] - center[1];
        const radius = Math.sqrt(dx * dx + dy * dy);

        const segments = 64;
        const circlePoints: THREE.Vector3[] = [];
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const x = center[0] + Math.cos(theta) * radius;
            const y = center[1] + Math.sin(theta) * radius;
            circlePoints.push(to3D(x, y));
        }

        return renderLineLoop(primitive.id, circlePoints, color);
    },
    renderAnnotation(
        primitive: SketchPrimitive,
        plane: SketchPlane
    ) {
        if (primitive.points.length < 2) return null;
        const center = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const edge = { x: primitive.points[1][0], y: primitive.points[1][1] };
        return React.createElement(CircleAnnotation, {
            key: `${primitive.id}-annotation`,
            center,
            edge,
            plane
        });
    }
};

export const polygonTool: Tool = {
    metadata: {
        id: 'polygon',
        label: 'Polygon',
        icon: 'Pentagon',
        category: 'sketch',
        group: 'Shape',
        description: 'Draw a regular polygon'
    },
    uiProperties: [
        { key: 'sides', label: 'Sides', type: 'number', default: 6, min: 3, max: 32, step: 1 },
        { key: 'sagitta', label: 'Sagitta', type: 'number', default: 0, unit: 'mm' }
    ],
    createShape(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string {
        const [center, edge] = primitive.points;
        const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
        const sides = primitive.properties?.sides || 6;
        const sagitta = primitive.properties?.sagitta || 0;
        const sketchName = codeManager.addFeature('drawPolysides', null, [radius, sides, sagitta]);
        if (center[0] !== 0 || center[1] !== 0) {
            codeManager.addOperation(sketchName, 'translate', [center[0], center[1]]);
        }
        codeManager.addOperation(sketchName, 'sketchOnPlane', [plane]);
        return sketchName;
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'polygon', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'polygon',
            points: [startPoint, startPoint],
            properties: { sides: properties?.sides || 6, sagitta: properties?.sagitta || 0, ...properties }
        };
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false
    ) {
        const color = isGhost ? "#00ffff" : "#ffff00";
        if (primitive.points.length < 2) return null;

        const center = primitive.points[0];
        const edge = primitive.points[1];
        const dx = edge[0] - center[0];
        const dy = edge[1] - center[1];
        const radius = Math.sqrt(dx * dx + dy * dy);
        const sides = primitive.properties?.sides || 6;
        const startAngle = Math.atan2(dy, dx);

        const polyPoints: THREE.Vector3[] = [];
        for (let i = 0; i <= sides; i++) {
            const theta = startAngle + (i / sides) * Math.PI * 2;
            const x = center[0] + Math.cos(theta) * radius;
            const y = center[1] + Math.sin(theta) * radius;
            polyPoints.push(to3D(x, y));
        }

        return renderLineLoop(primitive.id, polyPoints, color);
    }
};

export const textTool: Tool = {
    metadata: {
        id: 'text',
        label: 'Text',
        icon: 'Type',
        category: 'sketch',
        group: 'Shape',
        description: 'Draw text as a sketch'
    },
    uiProperties: [
        { key: 'text', label: 'Text', type: 'text', default: 'Text' },
        { key: 'fontSize', label: 'Font Size', type: 'number', default: 16, unit: 'mm', min: 1 }
    ],
    createShape(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string {
        const pos = primitive.points[0];
        const text = primitive.properties?.text || 'Text';
        const fontSize = primitive.properties?.fontSize || 16;
        const sketchName = codeManager.addFeature('drawText', null, [text, { startX: pos[0], startY: pos[1], fontSize }]);
        codeManager.addOperation(sketchName, 'sketchOnPlane', [plane]);
        return sketchName;
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'text', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'text',
            points: [startPoint],
            properties: { text: properties?.text || 'Text', fontSize: properties?.fontSize || 16, ...properties }
        };
    }
};

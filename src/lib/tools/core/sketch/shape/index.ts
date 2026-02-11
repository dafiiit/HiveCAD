import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../../../types';
import type { CodeManager } from '../../../../code-manager';
import { generateToolId } from '../../../types';
import { CircleAnnotation, RectangleAnnotation } from '../../../../../components/cad/SketchAnnotations';
import { LineSegment, Circle } from '../../../../sketch-graph/Geometry';

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
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const [p1, p2] = primitive.points;
        const p1x = p1[0], p1y = p1[1];
        const p2x = p2[0], p2y = p2[1];
        const p3 = { x: p2x, y: p1y };
        const p4 = { x: p1x, y: p2y };

        return [
            new LineSegment({ x: p1x, y: p1y }, p3),
            new LineSegment(p3, { x: p2x, y: p2y }),
            new LineSegment({ x: p2x, y: p2y }, p4),
            new LineSegment(p4, { x: p1x, y: p1y })
        ];
    },
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
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        // todo:refine Generate actual rounded-rectangle edges in the planar graph instead of reusing rectangles.
        // Reuse rectangle geometry for now (ignoring corners in graph for simplicity, as per legacy implementation)
        return rectangleTool.getPlanarGeometry!(primitive);
    },
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
        const color = isGhost ? "#00ffff" : "#ffff00";
        if (primitive.points.length < 2) return null;

        const [p1, p2] = primitive.points;
        const minX = Math.min(p1[0], p2[0]);
        const maxX = Math.max(p1[0], p2[0]);
        const minY = Math.min(p1[1], p2[1]);
        const maxY = Math.max(p1[1], p2[1]);

        const w = maxX - minX;
        const h = maxY - minY;
        const r = Math.min(primitive.properties?.radius || 3, w / 2, h / 2);

        if (r < 0.01) {
            return rectangleTool.renderPreview?.(primitive, to3D, isGhost) ?? null;
        }

        const arcSegments = 8;
        const pts: [number, number][] = [];

        // Bottom-right corner
        for (let i = 0; i <= arcSegments; i++) {
            const a = -Math.PI / 2 + (Math.PI / 2) * (i / arcSegments);
            pts.push([maxX - r + r * Math.cos(a), minY + r + r * Math.sin(a)]);
        }
        // Top-right corner
        for (let i = 0; i <= arcSegments; i++) {
            const a = 0 + (Math.PI / 2) * (i / arcSegments);
            pts.push([maxX - r + r * Math.cos(a), maxY - r + r * Math.sin(a)]);
        }
        // Top-left corner
        for (let i = 0; i <= arcSegments; i++) {
            const a = Math.PI / 2 + (Math.PI / 2) * (i / arcSegments);
            pts.push([minX + r + r * Math.cos(a), maxY - r + r * Math.sin(a)]);
        }
        // Bottom-left corner
        for (let i = 0; i <= arcSegments; i++) {
            const a = Math.PI + (Math.PI / 2) * (i / arcSegments);
            pts.push([minX + r + r * Math.cos(a), minY + r + r * Math.sin(a)]);
        }
        // Close
        pts.push(pts[0]);

        const displayPoints = pts.map(p => to3D(p[0], p[1]));
        return renderLineLoop(primitive.id, displayPoints, color);
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
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const [center, edge] = primitive.points;
        const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
        return [new Circle({ x: center[0], y: center[1] }, radius)];
    },
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
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const center = primitive.points[0];
        const edge = primitive.points[1];
        const sides = primitive.properties?.sides || 6;
        const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
        const dx = edge[0] - center[0];
        const dy = edge[1] - center[1];
        const startAngle = Math.atan2(dy, dx);

        const polyPoints: { x: number; y: number }[] = [];
        for (let i = 0; i <= sides; i++) {
            const theta = startAngle + (i / sides) * Math.PI * 2;
            polyPoints.push({
                x: center[0] + Math.cos(theta) * radius,
                y: center[1] + Math.sin(theta) * radius
            });
        }

        const geoms = [];
        for (let i = 0; i < polyPoints.length - 1; i++) {
            geoms.push(new LineSegment(polyPoints[i], polyPoints[i + 1]));
        }
        return geoms;
    },
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

export const ellipseTool: Tool = {
    metadata: {
        id: 'ellipse',
        label: 'Ellipse',
        icon: 'Circle',
        category: 'sketch',
        group: 'Shape',
        description: 'Draw an ellipse by center and corner'
    },
    uiProperties: [],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const center = primitive.points[0];
        const edge = primitive.points[1];
        const rx = Math.abs(edge[0] - center[0]) || 1;
        const ry = Math.abs(edge[1] - center[1]) || 1;
        const segments = 32;
        const result: any[] = [];
        for (let i = 0; i < segments; i++) {
            const a1 = (i / segments) * Math.PI * 2;
            const a2 = ((i + 1) / segments) * Math.PI * 2;
            result.push(new LineSegment(
                { x: center[0] + rx * Math.cos(a1), y: center[1] + ry * Math.sin(a1) },
                { x: center[0] + rx * Math.cos(a2), y: center[1] + ry * Math.sin(a2) },
            ));
        }
        return result;
    },
    createShape(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string {
        const [center, edge] = primitive.points;
        const rx = Math.abs(edge[0] - center[0]) || 1;
        const ry = Math.abs(edge[1] - center[1]) || 1;
        const sketchName = codeManager.addFeature('drawEllipse', null, [rx, ry]);
        if (center[0] !== 0 || center[1] !== 0) {
            codeManager.addOperation(sketchName, 'translate', [center[0], center[1]]);
        }
        codeManager.addOperation(sketchName, 'sketchOnPlane', [plane]);
        return sketchName;
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'ellipse', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'ellipse',
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
        const rx = Math.abs(edge[0] - center[0]) || 0.01;
        const ry = Math.abs(edge[1] - center[1]) || 0.01;

        const segments = 64;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            pts.push(to3D(
                center[0] + rx * Math.cos(theta),
                center[1] + ry * Math.sin(theta)
            ));
        }

        return renderLineLoop(primitive.id, pts, color);
    },
    renderAnnotation(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3
    ) {
        if (primitive.points.length < 2) return null;
        const center = primitive.points[0];
        const edge = primitive.points[1];
        const rx = Math.abs(edge[0] - center[0]);
        const ry = Math.abs(edge[1] - center[1]);
        const pos3D = to3D(center[0], center[1]);
        return React.createElement('group', { position: pos3D },
            React.createElement('mesh', null,
                React.createElement('sphereGeometry', { args: [0.15, 16, 16] }),
                React.createElement('meshBasicMaterial', { color: '#ff00ff', depthTest: false })
            )
        );
    }
};

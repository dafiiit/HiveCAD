import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { RectangleAnnotation } from '../../../../../../components/cad/SketchAnnotations';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderLineLoop } from '../helpers';

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

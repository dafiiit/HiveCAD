import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { renderLineLoop } from '../helpers';
import { rectangleTool } from '../rectangle';

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
        // TODO: Generate actual rounded-rectangle edges in the planar graph.
        // Reuse rectangle geometry for now (ignoring corners for simplicity).
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

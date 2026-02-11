import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderLineLoop } from '../helpers';

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
        plane: SketchPlane,
        lockedValues?: Record<string, number | null>
    ) {
        if (primitive.points.length < 2) return null;
        const center = primitive.points[0];
        const edge = primitive.points[1];
        const rx = Math.abs(edge[0] - center[0]);
        const ry = Math.abs(edge[1] - center[1]);
        // TODO: Implement proper ellipse annotation with radii dimensions
        const pos3D = (primitive as any).__to3D?.(center[0], center[1]);
        return null;
    }
};

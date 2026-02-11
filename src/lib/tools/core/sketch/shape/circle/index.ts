import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { CircleAnnotation } from '../../../../../../components/cad/SketchAnnotations';
import { Circle } from '../../../../../sketch-graph/Geometry';
import { renderLineLoop } from '../helpers';

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

import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderLine } from '../helpers';

export const smoothSplineTool: Tool = {
    metadata: {
        id: 'smoothSpline',
        label: 'Smooth Spline',
        icon: 'Spline',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a smooth spline curve through points',
    },
    uiProperties: [
        { key: 'startTangent', label: 'Start Tangent', type: 'number', default: 0, unit: 'deg' },
        { key: 'endTangent', label: 'End Tangent', type: 'number', default: 0, unit: 'deg' },
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
        const points = primitive.points.map(p => to3D(p[0], p[1]));
        if (points.length < 2) return null;

        const curve = new THREE.CatmullRomCurve3(points);
        const splinePoints = curve.getPoints(50);

        return React.createElement('group', { key: primitive.id },
            renderLine(`${primitive.id}-curve`, splinePoints, color),
            ...(isGhost ? points.map((p, i) =>
                React.createElement('mesh', { key: `${primitive.id}-pt-${i}`, position: p },
                    React.createElement('boxGeometry', { args: [0.3, 0.3, 0.3] }),
                    React.createElement('meshBasicMaterial', { color: '#ff00ff', depthTest: false })
                )
            ) : [])
        );
    },
};

import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../types';
import { generateToolId } from '../../../types';

/**
 * Construction geometry tools.
 * Construction lines/circles are used as references for constraining
 * real geometry but are NOT included in the profile or exported code.
 */

const CONSTRUCTION_COLOR = '#4488ff';
const CONSTRUCTION_GHOST_COLOR = '#2244aa';

// Dashed line rendering helper
const renderDashedLine = (
    key: string,
    points: THREE.Vector3[],
    color: string,
) => {
    if (points.length < 2) return null;
    return React.createElement('line', { key },
        React.createElement('bufferGeometry', null,
            React.createElement('bufferAttribute', {
                attach: 'attributes-position',
                count: points.length,
                array: new Float32Array(points.flatMap(v => [v.x, v.y, v.z])),
                itemSize: 3,
            })
        ),
        React.createElement('lineDashedMaterial', {
            color,
            dashSize: 0.8,
            gapSize: 0.4,
            linewidth: 1,
            depthTest: false,
        })
    );
};

export const constructionLineTool: Tool = {
    metadata: {
        id: 'constructionLine',
        label: 'Construction Line',
        icon: 'Ruler',
        category: 'sketch',
        group: 'Construction',
        description: 'Draw a construction line (reference only, not part of profile)',
    },
    uiProperties: [],
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'constructionLine', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'constructionLine',
            points: [startPoint, startPoint],
            properties: properties || {},
        };
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false,
    ) {
        const color = isGhost ? CONSTRUCTION_GHOST_COLOR : CONSTRUCTION_COLOR;
        const points = primitive.points.map(p => to3D(p[0], p[1]));
        if (points.length < 2) return null;

        // Extend the line beyond both endpoints to make it look infinite
        const dir = new THREE.Vector3().subVectors(points[1], points[0]);
        const len = dir.length();
        if (len < 1e-6) return null;
        dir.normalize();
        const ext = 500; // visually "infinite"
        const extStart = points[0].clone().sub(dir.clone().multiplyScalar(ext));
        const extEnd = points[1].clone().add(dir.clone().multiplyScalar(ext));

        return React.createElement('group', { key: primitive.id },
            renderDashedLine(`${primitive.id}-ext`, [extStart, extEnd], color),
            // Highlight the user-defined segment
            React.createElement('line', { key: `${primitive.id}-seg` },
                React.createElement('bufferGeometry', null,
                    React.createElement('bufferAttribute', {
                        attach: 'attributes-position',
                        count: 2,
                        array: new Float32Array(points.flatMap(v => [v.x, v.y, v.z])),
                        itemSize: 3,
                    })
                ),
                React.createElement('lineBasicMaterial', { color, linewidth: 2, depthTest: false })
            ),
            // Endpoint markers
            ...points.map((p, i) =>
                React.createElement('mesh', { key: `${primitive.id}-ep${i}`, position: p },
                    React.createElement('sphereGeometry', { args: [0.15, 8, 8] }),
                    React.createElement('meshBasicMaterial', { color: CONSTRUCTION_COLOR, depthTest: false })
                )
            )
        );
    },
};

export const constructionCircleTool: Tool = {
    metadata: {
        id: 'constructionCircle',
        label: 'Construction Circle',
        icon: 'CircleDot',
        category: 'sketch',
        group: 'Construction',
        description: 'Draw a construction circle (reference only)',
    },
    uiProperties: [],
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'constructionCircle', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'constructionCircle',
            points: [startPoint, startPoint],
            properties: properties || {},
        };
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false,
    ) {
        const color = isGhost ? CONSTRUCTION_GHOST_COLOR : CONSTRUCTION_COLOR;
        if (primitive.points.length < 2) return null;

        const center = primitive.points[0];
        const edge = primitive.points[1];
        const radius = Math.hypot(edge[0] - center[0], edge[1] - center[1]);

        const segments = 64;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            pts.push(to3D(
                center[0] + radius * Math.cos(theta),
                center[1] + radius * Math.sin(theta),
            ));
        }

        return React.createElement('group', { key: primitive.id },
            renderDashedLine(primitive.id + '-circ', pts, color),
            // Center marker
            React.createElement('mesh', { key: `${primitive.id}-center`, position: to3D(center[0], center[1]) },
                React.createElement('sphereGeometry', { args: [0.15, 8, 8] }),
                React.createElement('meshBasicMaterial', { color: CONSTRUCTION_COLOR, depthTest: false })
            )
        );
    },
};

export const centerPointArcTool: Tool = {
    metadata: {
        id: 'centerPointArc',
        label: 'Center Point Arc',
        icon: 'Undo2',
        category: 'sketch',
        group: 'Arc',
        description: 'Draw an arc by center, start, and end points',
    },
    uiProperties: [],
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'centerPointArc', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'centerPointArc',
            // First click = center, second click = start of arc, third = end of arc
            points: [startPoint, startPoint],
            properties: { ...properties, _step: 'radius' },
        };
    },
    continuePrimitive(primitive: SketchPrimitive, point: [number, number]): SketchPrimitive | null {
        // After center + radius-point, need one more click for the sweep end
        if (primitive.points.length === 2) {
            return {
                ...primitive,
                points: [...primitive.points, point],
                properties: { ...primitive.properties, _step: 'sweep' },
            };
        }
        return null; // Done
    },
    renderPreview(
        primitive: SketchPrimitive,
        to3D: (x: number, y: number) => THREE.Vector3,
        isGhost: boolean = false,
    ) {
        const color = isGhost ? '#00ffff' : '#ffff00';
        if (primitive.points.length < 2) return null;

        const center = primitive.points[0];
        const startPt = primitive.points[1];
        const radius = Math.hypot(startPt[0] - center[0], startPt[1] - center[1]);

        if (primitive.points.length === 2) {
            // Show radius line + full circle guide
            const segments = 64;
            const circlePts: THREE.Vector3[] = [];
            for (let i = 0; i <= segments; i++) {
                const theta = (i / segments) * Math.PI * 2;
                circlePts.push(to3D(
                    center[0] + radius * Math.cos(theta),
                    center[1] + radius * Math.sin(theta),
                ));
            }
            return React.createElement('group', { key: primitive.id },
                renderDashedLine(`${primitive.id}-guide`, circlePts, '#444488'),
                React.createElement('line', { key: `${primitive.id}-rad` },
                    React.createElement('bufferGeometry', null,
                        React.createElement('bufferAttribute', {
                            attach: 'attributes-position',
                            count: 2,
                            array: new Float32Array([
                                ...to3D(center[0], center[1]).toArray(),
                                ...to3D(startPt[0], startPt[1]).toArray(),
                            ]),
                            itemSize: 3,
                        })
                    ),
                    React.createElement('lineBasicMaterial', { color, linewidth: 2, depthTest: false })
                )
            );
        }

        // 3 points → render the arc sweep
        const endPt = primitive.points[2];
        const startAngle = Math.atan2(startPt[1] - center[1], startPt[0] - center[0]);
        const endAngle = Math.atan2(endPt[1] - center[1], endPt[0] - center[0]);
        let sweep = endAngle - startAngle;
        if (sweep <= 0) sweep += 2 * Math.PI;

        const arcSegments = Math.max(16, Math.round((sweep / (2 * Math.PI)) * 64));
        const arcPts: THREE.Vector3[] = [];
        for (let i = 0; i <= arcSegments; i++) {
            const theta = startAngle + (i / arcSegments) * sweep;
            arcPts.push(to3D(
                center[0] + radius * Math.cos(theta),
                center[1] + radius * Math.sin(theta),
            ));
        }

        return React.createElement('group', { key: primitive.id },
            React.createElement('line', { key: `${primitive.id}-arc` },
                React.createElement('bufferGeometry', null,
                    React.createElement('bufferAttribute', {
                        attach: 'attributes-position',
                        count: arcPts.length,
                        array: new Float32Array(arcPts.flatMap(v => [v.x, v.y, v.z])),
                        itemSize: 3,
                    })
                ),
                React.createElement('lineBasicMaterial', { color, linewidth: 3, depthTest: false })
            ),
            // Center point marker
            React.createElement('mesh', { key: `${primitive.id}-center`, position: to3D(center[0], center[1]) },
                React.createElement('sphereGeometry', { args: [0.2, 8, 8] }),
                React.createElement('meshBasicMaterial', { color: '#ff00ff', depthTest: false })
            ),
        );
    },
};

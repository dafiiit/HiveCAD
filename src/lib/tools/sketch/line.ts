import React from 'react';
import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../types';
import type { CodeManager } from '../../code-manager';
import { generateToolId } from '../types';
import { LineAnnotation } from '../../../components/cad/SketchAnnotations';

export const lineTool: Tool = {
    metadata: {
        id: 'line',
        label: 'Line',
        icon: 'Minus',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a line between points'
    },
    uiProperties: [],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        // For multi-point lines, add each segment
        for (let i = 1; i < primitive.points.length; i++) {
            const pt = primitive.points[i];
            codeManager.addOperation(sketchName, 'lineTo', [[pt[0], pt[1]]]);
        }
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'line', points };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'line',
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

        return React.createElement('line', { key: primitive.id },
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
    },
    renderAnnotation(
        primitive: SketchPrimitive,
        plane: SketchPlane,
        lockedValues?: Record<string, number | null>
    ) {
        if (primitive.points.length < 2) return null;
        const start = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const end = { x: primitive.points[1][0], y: primitive.points[1][1] };
        return React.createElement(LineAnnotation, {
            key: `${primitive.id}-annotation`,
            start,
            end,
            plane,
            lockedLength: lockedValues?.length ?? null,
            lockedAngle: lockedValues?.angle ?? null
        });
    }
};

export const vlineTool: Tool = {
    metadata: {
        id: 'vline',
        label: 'Vertical Line',
        icon: 'ArrowDown',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a vertical line'
    },
    uiProperties: [
        { key: 'dy', label: 'Length', type: 'number', default: 10, unit: 'mm' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const dy = primitive.properties?.dy || (primitive.points[1][1] - primitive.points[0][1]);
        codeManager.addOperation(sketchName, 'vLine', [dy]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'vline', points, properties };
    }
};

export const hlineTool: Tool = {
    metadata: {
        id: 'hline',
        label: 'Horizontal Line',
        icon: 'ArrowRight',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a horizontal line'
    },
    uiProperties: [
        { key: 'dx', label: 'Length', type: 'number', default: 10, unit: 'mm' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const dx = primitive.properties?.dx || (primitive.points[1][0] - primitive.points[0][0]);
        codeManager.addOperation(sketchName, 'hLine', [dx]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'hline', points, properties };
    }
};

export const polarLineTool: Tool = {
    metadata: {
        id: 'polarline',
        label: 'Polar Line',
        icon: 'Compass',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a line at a specific angle'
    },
    uiProperties: [
        { key: 'distance', label: 'Distance', type: 'number', default: 10, unit: 'mm' },
        { key: 'angle', label: 'Angle', type: 'number', default: 45, unit: 'deg' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const distance = primitive.properties?.distance || 10;
        const angle = primitive.properties?.angle || 0;
        codeManager.addOperation(sketchName, 'polarLine', [distance, angle]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'polarline', points, properties };
    }
};

export const tangentLineTool: Tool = {
    metadata: {
        id: 'tangentline',
        label: 'Tangent Line',
        icon: 'CornerUpRight',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a line tangent to the previous curve'
    },
    uiProperties: [
        { key: 'distance', label: 'Distance', type: 'number', default: 10, unit: 'mm' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const distance = primitive.properties?.distance || 10;
        codeManager.addOperation(sketchName, 'tangentLine', [distance]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'tangentline', points, properties };
    }
};

export const movePointerTool: Tool = {
    metadata: {
        id: 'movePointer',
        label: 'Move Pointer',
        icon: 'MousePointer',
        category: 'sketch',
        group: 'Line',
        description: 'Move the drawing pointer without creating a line'
    },
    uiProperties: [],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const pt = primitive.points[0];
        codeManager.addOperation(sketchName, 'movePointerTo', [[pt[0], pt[1]]]);
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'movePointer', points };
    }
};

import type { Tool, SketchPrimitiveData } from '../types';
import type { CodeManager } from '../../code-manager';
import { generateToolId } from '../types';

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
    }
};

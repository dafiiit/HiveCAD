import type { Tool, SketchPrimitiveData } from '../types';
import type { CodeManager } from '../../code-manager';
import { generateToolId } from '../types';

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
    }
};

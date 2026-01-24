import type { Tool, SketchPrimitiveData } from '../types';
import type { CodeManager } from '../../code-manager';
import { generateToolId } from '../types';

export const smoothSplineTool: Tool = {
    metadata: {
        id: 'smoothSpline',
        label: 'Smooth Spline',
        icon: 'Spline',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a smooth spline curve through points'
    },
    uiProperties: [
        { key: 'startTangent', label: 'Start Tangent', type: 'number', default: 0, unit: 'deg' },
        { key: 'endTangent', label: 'End Tangent', type: 'number', default: 0, unit: 'deg' }
    ],
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
    }
};

export const bezierTool: Tool = {
    metadata: {
        id: 'bezier',
        label: 'Bezier Curve',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a Bezier curve with control points'
    },
    uiProperties: [],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const end = primitive.points[1];
        const controlPoints = primitive.points.slice(2).map(p => [p[0], p[1]]);
        codeManager.addOperation(sketchName, 'bezierCurveTo', [[end[0], end[1]], controlPoints]);
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'bezier', points };
    }
};

export const quadraticBezierTool: Tool = {
    metadata: {
        id: 'quadraticBezier',
        label: 'Quadratic Bezier',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a quadratic Bezier curve'
    },
    uiProperties: [
        { key: 'ctrlX', label: 'Control X', type: 'number', default: 5, unit: 'mm' },
        { key: 'ctrlY', label: 'Control Y', type: 'number', default: 5, unit: 'mm' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const end = primitive.points[1];
        const ctrlX = primitive.properties?.ctrlX || 5;
        const ctrlY = primitive.properties?.ctrlY || 5;
        const start = primitive.points[0];
        const ctrl = [start[0] + ctrlX, start[1] + ctrlY];
        codeManager.addOperation(sketchName, 'quadraticBezierCurveTo', [[end[0], end[1]], ctrl]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'quadraticBezier', points, properties };
    }
};

export const cubicBezierTool: Tool = {
    metadata: {
        id: 'cubicBezier',
        label: 'Cubic Bezier',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a cubic Bezier curve'
    },
    uiProperties: [
        { key: 'ctrlStartX', label: 'Control Start X', type: 'number', default: 3, unit: 'mm' },
        { key: 'ctrlStartY', label: 'Control Start Y', type: 'number', default: 5, unit: 'mm' },
        { key: 'ctrlEndX', label: 'Control End X', type: 'number', default: 3, unit: 'mm' },
        { key: 'ctrlEndY', label: 'Control End Y', type: 'number', default: 5, unit: 'mm' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const start = primitive.points[0];
        const end = primitive.points[1];
        const ctrlStartX = primitive.properties?.ctrlStartX || 3;
        const ctrlStartY = primitive.properties?.ctrlStartY || 5;
        const ctrlEndX = primitive.properties?.ctrlEndX || 3;
        const ctrlEndY = primitive.properties?.ctrlEndY || 5;
        const ctrlStart = [start[0] + ctrlStartX, start[1] + ctrlStartY];
        const ctrlEnd = [end[0] - ctrlEndX, end[1] + ctrlEndY];
        codeManager.addOperation(sketchName, 'cubicBezierCurveTo', [[end[0], end[1]], ctrlStart, ctrlEnd]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'cubicBezier', points, properties };
    }
};

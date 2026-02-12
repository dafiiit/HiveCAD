import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchToolContext } from '../../../../types';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderQuadraticBezierPreview } from './preview';

export const quadraticBezierTool: Tool = {
    metadata: {
        id: 'quadraticBezier',
        label: 'Quadratic Bezier',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a quadratic Bezier curve',
    },
    uiProperties: [
        { key: 'ctrlX', label: 'Control X', type: 'number', default: 5, unit: 'mm' },
        { key: 'ctrlY', label: 'Control Y', type: 'number', default: 5, unit: 'mm' },
    ],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const start = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const end = { x: primitive.points[1][0], y: primitive.points[1][1] };
        const ctrlX = primitive.properties?.ctrlX ?? 5;
        const ctrlY = primitive.properties?.ctrlY ?? 5;
        const ctrl = { x: start.x + ctrlX, y: start.y + ctrlY };
        // Tessellate quadratic Bezier
        const N = 16;
        const geoms = [];
        for (let i = 0; i < N; i++) {
            const t1 = i / N, t2 = (i + 1) / N;
            const evalQ = (t: number) => {
                const mt = 1 - t;
                return { x: mt * mt * start.x + 2 * mt * t * ctrl.x + t * t * end.x, y: mt * mt * start.y + 2 * mt * t * ctrl.y + t * t * end.y };
            };
            geoms.push(new LineSegment(evalQ(t1), evalQ(t2)));
        }
        return geoms;
    },
    addToSketch(context: SketchToolContext): void {
        const { codeManager, sketchName, primitive } = context;
        const end = primitive.points[1];
        const ctrlX = primitive.properties?.ctrlX || 5;
        const ctrlY = primitive.properties?.ctrlY || 5;
        const start = primitive.points[0];
        const ctrl = [start[0] + ctrlX, start[1] + ctrlY];
        codeManager.addOperation(sketchName, 'quadraticBezierCurveTo', [[end[0], end[1]], ctrl]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'quadraticBezier', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'quadraticBezier',
            points: [startPoint, startPoint],
            properties: { ctrlX: properties?.ctrlX || 5, ctrlY: properties?.ctrlY || 5, ...properties },
        };
    },
    renderPreview: renderQuadraticBezierPreview,
};

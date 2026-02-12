import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchToolContext } from '../../../../types';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderCubicBezierPreview } from './preview';

export const cubicBezierTool: Tool = {
    metadata: {
        id: 'cubicBezier',
        label: 'Cubic Bezier',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a cubic Bezier curve',
    },
    uiProperties: [
        { key: 'ctrlStartX', label: 'Control Start X', type: 'number', default: 3, unit: 'mm' },
        { key: 'ctrlStartY', label: 'Control Start Y', type: 'number', default: 5, unit: 'mm' },
        { key: 'ctrlEndX', label: 'Control End X', type: 'number', default: 3, unit: 'mm' },
        { key: 'ctrlEndY', label: 'Control End Y', type: 'number', default: 5, unit: 'mm' },
    ],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const start = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const end = { x: primitive.points[1][0], y: primitive.points[1][1] };
        const props = primitive.properties || {};
        const c1 = { x: start.x + (props.ctrlStartX || 3), y: start.y + (props.ctrlStartY || 5) };
        const c2 = { x: end.x - (props.ctrlEndX || 3), y: end.y + (props.ctrlEndY || 5) };
        // Tessellate cubic Bezier
        const N = 16;
        const geoms = [];
        for (let i = 0; i < N; i++) {
            const t1 = i / N, t2 = (i + 1) / N;
            const evalC = (t: number) => {
                const mt = 1 - t;
                return {
                    x: mt * mt * mt * start.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * end.x,
                    y: mt * mt * mt * start.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * end.y,
                };
            };
            geoms.push(new LineSegment(evalC(t1), evalC(t2)));
        }
        return geoms;
    },
    addToSketch(context: SketchToolContext): void {
        const { codeManager, sketchName, primitive } = context;
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
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'cubicBezier',
            points: [startPoint, startPoint],
            properties: {
                ctrlStartX: properties?.ctrlStartX || 3,
                ctrlStartY: properties?.ctrlStartY || 5,
                ctrlEndX: properties?.ctrlEndX || 3,
                ctrlEndY: properties?.ctrlEndY || 5,
                ...properties,
            },
        };
    },
    renderPreview: renderCubicBezierPreview,
};

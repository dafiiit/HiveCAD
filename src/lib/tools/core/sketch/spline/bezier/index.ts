import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderBezierPreview } from './preview';

export const bezierTool: Tool = {
    metadata: {
        id: 'bezier',
        label: 'Bezier Curve',
        icon: 'Waves',
        category: 'sketch',
        group: 'Spline',
        description: 'Draw a Bezier curve with control points',
    },
    uiProperties: [],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const start = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const end = { x: primitive.points[1][0], y: primitive.points[1][1] };
        const ctrl = primitive.points.length > 2
            ? { x: primitive.points[2][0], y: primitive.points[2][1] }
            : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
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
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const end = primitive.points[1];
        const controlPoints = primitive.points.slice(2).map(p => [p[0], p[1]]);
        codeManager.addOperation(sketchName, 'bezierCurveTo', [[end[0], end[1]], controlPoints]);
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'bezier', points };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        const ctrlX = properties?.ctrlX ?? startPoint[0] + 5;
        const ctrlY = properties?.ctrlY ?? startPoint[1] + 5;
        return {
            id: generateToolId(),
            type: 'bezier',
            points: [startPoint, startPoint, [ctrlX, ctrlY]],
            properties: properties || {},
        };
    },
    renderPreview: renderBezierPreview,
};

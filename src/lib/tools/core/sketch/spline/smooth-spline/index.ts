import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderSmoothSplinePreview } from './preview';

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
        // Approximate Catmull-Rom spline with tessellated line segments
        const pts = primitive.points.map(p => ({ x: p[0], y: p[1] }));
        const geoms = [];
        const segsPerSpan = 8;
        for (let span = 0; span < pts.length - 1; span++) {
            const p0 = pts[Math.max(0, span - 1)];
            const p1 = pts[span];
            const p2 = pts[Math.min(pts.length - 1, span + 1)];
            const p3 = pts[Math.min(pts.length - 1, span + 2)];
            for (let i = 0; i < segsPerSpan; i++) {
                const t1 = i / segsPerSpan;
                const t2 = (i + 1) / segsPerSpan;
                const evalCR = (t: number) => {
                    const t2v = t * t, t3v = t2v * t;
                    return {
                        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2v + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3v),
                        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2v + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3v),
                    };
                };
                geoms.push(new LineSegment(evalCR(t1), evalCR(t2)));
            }
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
    renderPreview: renderSmoothSplinePreview,
};

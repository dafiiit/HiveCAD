import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../../../types';
import type { CodeManager } from '../../../../code-manager';
import { generateToolId } from '../../../types';
import { LineSegment } from '../../../../sketch-graph/Geometry';
import { renderLinePreview, renderLineAnnotation } from './preview';

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
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        const geoms = [];
        for (let i = 0; i < primitive.points.length - 1; i++) {
            const p1 = { x: primitive.points[i][0], y: primitive.points[i][1] };
            const p2 = { x: primitive.points[i + 1][0], y: primitive.points[i + 1][1] };
            geoms.push(new LineSegment(p1, p2));
        }
        return geoms;
    },
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
    renderPreview: renderLinePreview,
    renderAnnotation: renderLineAnnotation,
};

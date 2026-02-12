import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderRectanglePreview, renderRectangleAnnotation } from './preview';

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
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const [p1, p2] = primitive.points;
        const p1x = p1[0], p1y = p1[1];
        const p2x = p2[0], p2y = p2[1];
        const p3 = { x: p2x, y: p1y };
        const p4 = { x: p1x, y: p2y };

        return [
            new LineSegment({ x: p1x, y: p1y }, p3),
            new LineSegment(p3, { x: p2x, y: p2y }),
            new LineSegment({ x: p2x, y: p2y }, p4),
            new LineSegment(p4, { x: p1x, y: p1y })
        ];
    },
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
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'rectangle',
            points: [startPoint, startPoint],
            properties: properties || {}
        };
    },
    renderPreview: renderRectanglePreview,
    renderAnnotation: renderRectangleAnnotation,
};

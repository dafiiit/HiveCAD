import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../../../types';
import { arcFromThreePoints } from '../../../../sketch-graph/Geometry';
import type { CodeManager } from '../../../../code-manager';
import { generateToolId } from '../../../types';
import { renderArcPreview, renderArcAnnotation } from './preview';

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
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 3) return [];
        const p1 = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const p2 = { x: primitive.points[1][0], y: primitive.points[1][1] }; // End
        const p3 = { x: primitive.points[2][0], y: primitive.points[2][1] }; // Via
        const arc = arcFromThreePoints(p1, p2, p3);
        return arc ? [arc] : [];
    },
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
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'threePointsArc',
            points: [startPoint, startPoint],
            properties: properties || {}
        };
    },
    renderPreview: renderArcPreview,
    renderAnnotation: renderArcAnnotation,
};

// Re-export centerPointArcTool (moved from construction/ to its correct group)
export { centerPointArcTool } from './center-point-arc';

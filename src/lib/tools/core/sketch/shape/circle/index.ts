import type { Tool, SketchPrimitiveData, SketchPrimitive, ShapeToolContext } from '../../../../types';
import { generateToolId } from '../../../../types';
import { Circle } from '../../../../../sketch-graph/Geometry';
import { renderCirclePreview, renderCircleAnnotation } from './preview';

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
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const [center, edge] = primitive.points;
        const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
        return [new Circle({ x: center[0], y: center[1] }, radius)];
    },
    createShape(context: ShapeToolContext): string {
        const { codeManager, primitive, plane } = context;
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
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'circle',
            points: [startPoint, startPoint],
            properties: properties || {}
        };
    },
    renderPreview: renderCirclePreview,
    renderAnnotation: renderCircleAnnotation,
};

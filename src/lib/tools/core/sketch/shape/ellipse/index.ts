import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchPlane } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderEllipsePreview, renderEllipseAnnotation } from './preview';

export const ellipseTool: Tool = {
    metadata: {
        id: 'ellipse',
        label: 'Ellipse',
        icon: 'Circle',
        category: 'sketch',
        group: 'Shape',
        description: 'Draw an ellipse by center and corner'
    },
    uiProperties: [],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const center = primitive.points[0];
        const edge = primitive.points[1];
        const rx = Math.abs(edge[0] - center[0]) || 1;
        const ry = Math.abs(edge[1] - center[1]) || 1;
        const segments = 32;
        const result: any[] = [];
        for (let i = 0; i < segments; i++) {
            const a1 = (i / segments) * Math.PI * 2;
            const a2 = ((i + 1) / segments) * Math.PI * 2;
            result.push(new LineSegment(
                { x: center[0] + rx * Math.cos(a1), y: center[1] + ry * Math.sin(a1) },
                { x: center[0] + rx * Math.cos(a2), y: center[1] + ry * Math.sin(a2) },
            ));
        }
        return result;
    },
    createShape(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string {
        const [center, edge] = primitive.points;
        const rx = Math.abs(edge[0] - center[0]) || 1;
        const ry = Math.abs(edge[1] - center[1]) || 1;
        const sketchName = codeManager.addFeature('drawEllipse', null, [rx, ry]);
        if (center[0] !== 0 || center[1] !== 0) {
            codeManager.addOperation(sketchName, 'translate', [center[0], center[1]]);
        }
        codeManager.addOperation(sketchName, 'sketchOnPlane', [plane]);
        return sketchName;
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'ellipse', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'ellipse',
            points: [startPoint, startPoint],
            properties: properties || {}
        };
    },
    renderPreview: renderEllipsePreview,
    renderAnnotation: renderEllipseAnnotation,
};

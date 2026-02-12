import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { renderPolygonPreview } from './preview';

export const polygonTool: Tool = {
    metadata: {
        id: 'polygon',
        label: 'Polygon',
        icon: 'Pentagon',
        category: 'sketch',
        group: 'Shape',
        description: 'Draw a regular polygon'
    },
    uiProperties: [
        { key: 'sides', label: 'Sides', type: 'number', default: 6, min: 3, max: 32, step: 1 },
        { key: 'sagitta', label: 'Sagitta', type: 'number', default: 0, unit: 'mm' }
    ],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const center = primitive.points[0];
        const edge = primitive.points[1];
        const sides = primitive.properties?.sides || 6;
        const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
        const dx = edge[0] - center[0];
        const dy = edge[1] - center[1];
        const startAngle = Math.atan2(dy, dx);

        const polyPoints: { x: number; y: number }[] = [];
        for (let i = 0; i <= sides; i++) {
            const theta = startAngle + (i / sides) * Math.PI * 2;
            polyPoints.push({
                x: center[0] + Math.cos(theta) * radius,
                y: center[1] + Math.sin(theta) * radius
            });
        }

        const geoms = [];
        for (let i = 0; i < polyPoints.length - 1; i++) {
            geoms.push(new LineSegment(polyPoints[i], polyPoints[i + 1]));
        }
        return geoms;
    },
    createShape(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string {
        const [center, edge] = primitive.points;
        const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
        const sides = primitive.properties?.sides || 6;
        const sagitta = primitive.properties?.sagitta || 0;
        const sketchName = codeManager.addFeature('drawPolysides', null, [radius, sides, sagitta]);
        if (center[0] !== 0 || center[1] !== 0) {
            codeManager.addOperation(sketchName, 'translate', [center[0], center[1]]);
        }
        codeManager.addOperation(sketchName, 'sketchOnPlane', [plane]);
        return sketchName;
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'polygon', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'polygon',
            points: [startPoint, startPoint],
            properties: { sides: properties?.sides || 6, sagitta: properties?.sagitta || 0, ...properties }
        };
    },
    renderPreview: renderPolygonPreview,
};

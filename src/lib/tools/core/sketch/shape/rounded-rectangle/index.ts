import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { LineSegment } from '../../../../../sketch-graph/Geometry';
import { rectangleTool } from '../rectangle';
import { renderRoundedRectanglePreview } from './preview';

export const roundedRectangleTool: Tool = {
    metadata: {
        id: 'roundedRectangle',
        label: 'Rounded Rectangle',
        icon: 'RectangleHorizontal',
        category: 'sketch',
        group: 'Shape',
        description: 'Draw a rectangle with rounded corners'
    },
    uiProperties: [
        { key: 'radius', label: 'Corner Radius', type: 'number', default: 3, unit: 'mm', min: 0 }
    ],
    getPlanarGeometry(primitive: SketchPrimitiveData): any[] {
        if (primitive.points.length < 2) return [];
        const [p1, p2] = primitive.points;
        const minX = Math.min(p1[0], p2[0]);
        const maxX = Math.max(p1[0], p2[0]);
        const minY = Math.min(p1[1], p2[1]);
        const maxY = Math.max(p1[1], p2[1]);
        const w = maxX - minX;
        const h = maxY - minY;
        const r = Math.min(primitive.properties?.radius || 3, w / 2, h / 2);

        if (r < 0.01) {
            return rectangleTool.getPlanarGeometry!(primitive);
        }

        const result: any[] = [];
        // Straight edges
        result.push(new LineSegment({ x: minX + r, y: minY }, { x: maxX - r, y: minY })); // bottom
        result.push(new LineSegment({ x: maxX, y: minY + r }, { x: maxX, y: maxY - r })); // right
        result.push(new LineSegment({ x: maxX - r, y: maxY }, { x: minX + r, y: maxY })); // top
        result.push(new LineSegment({ x: minX, y: maxY - r }, { x: minX, y: minY + r })); // left

        // Corner arcs approximated as line segment chains
        const arcSegs = 8;
        const corners = [
            { cx: maxX - r, cy: minY + r, start: -Math.PI / 2 }, // bottom-right
            { cx: maxX - r, cy: maxY - r, start: 0 },             // top-right
            { cx: minX + r, cy: maxY - r, start: Math.PI / 2 },   // top-left
            { cx: minX + r, cy: minY + r, start: Math.PI },       // bottom-left
        ];
        for (const { cx, cy, start } of corners) {
            for (let i = 0; i < arcSegs; i++) {
                const a1 = start + (i / arcSegs) * (Math.PI / 2);
                const a2 = start + ((i + 1) / arcSegs) * (Math.PI / 2);
                result.push(new LineSegment(
                    { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) },
                    { x: cx + r * Math.cos(a2), y: cy + r * Math.sin(a2) },
                ));
            }
        }
        return result;
    },
    createShape(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string {
        const [p1, p2] = primitive.points;
        const width = Math.abs(p2[0] - p1[0]);
        const height = Math.abs(p2[1] - p1[1]);
        const radius = primitive.properties?.radius || 3;
        const sketchName = codeManager.addFeature('drawRoundedRectangle', null, [width, height, radius]);
        const centerX = (p1[0] + p2[0]) / 2;
        const centerY = (p1[1] + p2[1]) / 2;
        if (centerX !== 0 || centerY !== 0) {
            codeManager.addOperation(sketchName, 'translate', [centerX, centerY]);
        }
        codeManager.addOperation(sketchName, 'sketchOnPlane', [plane]);
        return sketchName;
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'roundedRectangle', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'roundedRectangle',
            points: [startPoint, startPoint],
            properties: { radius: properties?.radius || 3, ...properties }
        };
    },
    renderPreview: renderRoundedRectanglePreview,
};

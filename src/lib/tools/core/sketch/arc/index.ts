import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive, SketchToolContext } from '../../../types';
import { arcFromThreePoints } from '../../../../sketch-graph/Geometry';
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
    addToSketch(context: SketchToolContext): void {
        const { codeManager, sketchName, primitive } = context;
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
    getDisplayPoints(primitive: SketchPrimitive, to3D: (x: number, y: number) => THREE.Vector3): THREE.Vector3[] | null {
        if (primitive.points.length < 2) return null;
        if (primitive.points.length === 2) {
            // Only start+end defined — show chord
            return primitive.points.map(p => to3D(p[0], p[1]));
        }
        const start = { x: primitive.points[0][0], y: primitive.points[0][1] };
        const end   = { x: primitive.points[1][0], y: primitive.points[1][1] };
        const via   = { x: primitive.points[2][0], y: primitive.points[2][1] };
        const arc = arcFromThreePoints(start, end, via);
        const maxRadius = 10000;
        if (arc && arc.radius < maxRadius && arc.radius > 0.01) {
            const clockwise = !arc.ccw;
            let s = arc.startAngle;
            let e = arc.endAngle;
            if (!clockwise) { if (e < s) e += 2 * Math.PI; }
            else            { if (e > s) e -= 2 * Math.PI; }
            const curve = new THREE.EllipseCurve(
                arc.center.x, arc.center.y,
                arc.radius, arc.radius,
                s, e, clockwise, 0
            );
            return curve.getPoints(50).map(p => to3D(p.x, p.y));
        }
        // Fallback: chord between start and end
        return [to3D(start.x, start.y), to3D(end.x, end.y)];
    },
};

// Re-export centerPointArcTool (moved from construction/ to its correct group)
export { centerPointArcTool } from './center-point-arc';

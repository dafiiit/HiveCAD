import * as THREE from 'three';
import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import { generateToolId } from '../../../../types';
import { renderCenterPointArcPreview } from './preview';

export const centerPointArcTool: Tool = {
    metadata: {
        id: 'centerPointArc',
        label: 'Center Point Arc',
        icon: 'Undo2',
        category: 'sketch',
        group: 'Arc',
        description: 'Draw an arc by center, start, and end points',
    },
    uiProperties: [],
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'centerPointArc', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'centerPointArc',
            // First click = center, second click = start of arc, third = end of arc
            points: [startPoint, startPoint],
            properties: { ...properties, _step: 'radius' },
        };
    },
    continuePrimitive(primitive: SketchPrimitive, point: [number, number]): SketchPrimitive | null {
        // After center + radius-point, need one more click for the sweep end
        if (primitive.points.length === 2) {
            return {
                ...primitive,
                points: [...primitive.points, point],
                properties: { ...primitive.properties, _step: 'sweep' },
            };
        }
        return null; // Done
    },
    renderPreview: renderCenterPointArcPreview,
    getDisplayPoints(primitive: SketchPrimitive, to3D: (x: number, y: number) => THREE.Vector3): THREE.Vector3[] | null {
        if (primitive.points.length < 3) return null;
        const center  = primitive.points[0];
        const startPt = primitive.points[1];
        const endPt   = primitive.points[2];
        const radius = Math.hypot(startPt[0] - center[0], startPt[1] - center[1]);
        if (radius < 0.01) return null;
        const startAngle = Math.atan2(startPt[1] - center[1], startPt[0] - center[0]);
        const endAngle   = Math.atan2(endPt[1]   - center[1], endPt[0]   - center[0]);
        let sweep = endAngle - startAngle;
        if (sweep <= 0) sweep += 2 * Math.PI;
        const segments = Math.max(16, Math.round((sweep / (2 * Math.PI)) * 64));
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= segments; i++) {
            const theta = startAngle + (i / segments) * sweep;
            pts.push(to3D(
                center[0] + radius * Math.cos(theta),
                center[1] + radius * Math.sin(theta),
            ));
        }
        return pts;
    },
};

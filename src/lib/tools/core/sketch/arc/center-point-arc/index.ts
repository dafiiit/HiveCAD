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
};

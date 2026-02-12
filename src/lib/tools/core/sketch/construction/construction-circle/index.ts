import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import { generateToolId } from '../../../../types';
import { renderConstructionCirclePreview } from './preview';

export const constructionCircleTool: Tool = {
    metadata: {
        id: 'constructionCircle',
        label: 'Construction Circle',
        icon: 'CircleDot',
        category: 'sketch',
        group: 'Construction',
        description: 'Draw a construction circle (reference only)',
    },
    uiProperties: [],
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'constructionCircle', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'constructionCircle',
            points: [startPoint, startPoint],
            properties: properties || {},
        };
    },
    renderPreview: renderConstructionCirclePreview,
};

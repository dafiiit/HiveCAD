import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import { generateToolId } from '../../../../types';
import { renderConstructionLinePreview } from './preview';

export const constructionLineTool: Tool = {
    metadata: {
        id: 'constructionLine',
        label: 'Construction Line',
        icon: 'Ruler',
        category: 'sketch',
        group: 'Construction',
        description: 'Draw a construction line (reference only, not part of profile)',
    },
    uiProperties: [],
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'constructionLine', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'constructionLine',
            points: [startPoint, startPoint],
            properties: properties || {},
        };
    },
    renderPreview: renderConstructionLinePreview,
};

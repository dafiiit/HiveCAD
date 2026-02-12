import type { Tool, SketchPrimitiveData, SketchPrimitive } from '../../../../types';
import type { CodeManager } from '../../../../../code-manager';
import { generateToolId } from '../../../../types';
import { renderTextPreview } from './preview';

export const textTool: Tool = {
    metadata: {
        id: 'text',
        label: 'Text',
        icon: 'Type',
        category: 'sketch',
        group: 'Shape',
        description: 'Draw text as a sketch (experimental — preview not available)',
        experimental: true,
    },
    uiProperties: [
        { key: 'text', label: 'Text', type: 'text', default: 'Text' },
        { key: 'fontSize', label: 'Font Size', type: 'number', default: 16, unit: 'mm', min: 1 }
    ],
    createShape(codeManager: CodeManager, primitive: SketchPrimitiveData, plane: string): string {
        const pos = primitive.points[0];
        const text = primitive.properties?.text || 'Text';
        const fontSize = primitive.properties?.fontSize || 16;
        const sketchName = codeManager.addFeature('drawText', null, [text, { startX: pos[0], startY: pos[1], fontSize }]);
        codeManager.addOperation(sketchName, 'sketchOnPlane', [plane]);
        return sketchName;
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'text', points, properties };
    },
    createInitialPrimitive(startPoint: [number, number], properties?: Record<string, any>): SketchPrimitive {
        return {
            id: generateToolId(),
            type: 'text',
            points: [startPoint],
            properties: { text: properties?.text || 'Text', fontSize: properties?.fontSize || 16, ...properties }
        };
    },
    renderPreview: renderTextPreview,
};

import type { Tool, SketchPrimitiveData } from '../types';
import type { CodeManager } from '../../code-manager';
import { generateToolId } from '../types';

export const lineTool: Tool = {
    metadata: {
        id: 'line',
        label: 'Line',
        icon: 'Minus',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a line between points'
    },
    uiProperties: [],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        // For multi-point lines, add each segment
        for (let i = 1; i < primitive.points.length; i++) {
            const pt = primitive.points[i];
            codeManager.addOperation(sketchName, 'lineTo', [[pt[0], pt[1]]]);
        }
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'line', points };
    }
};

export const vlineTool: Tool = {
    metadata: {
        id: 'vline',
        label: 'Vertical Line',
        icon: 'ArrowDown',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a vertical line'
    },
    uiProperties: [
        { key: 'dy', label: 'Length', type: 'number', default: 10, unit: 'mm' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const dy = primitive.properties?.dy || (primitive.points[1][1] - primitive.points[0][1]);
        codeManager.addOperation(sketchName, 'vLine', [dy]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'vline', points, properties };
    }
};

export const hlineTool: Tool = {
    metadata: {
        id: 'hline',
        label: 'Horizontal Line',
        icon: 'ArrowRight',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a horizontal line'
    },
    uiProperties: [
        { key: 'dx', label: 'Length', type: 'number', default: 10, unit: 'mm' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const dx = primitive.properties?.dx || (primitive.points[1][0] - primitive.points[0][0]);
        codeManager.addOperation(sketchName, 'hLine', [dx]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'hline', points, properties };
    }
};

export const polarLineTool: Tool = {
    metadata: {
        id: 'polarline',
        label: 'Polar Line',
        icon: 'Compass',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a line at a specific angle'
    },
    uiProperties: [
        { key: 'distance', label: 'Distance', type: 'number', default: 10, unit: 'mm' },
        { key: 'angle', label: 'Angle', type: 'number', default: 45, unit: 'deg' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const distance = primitive.properties?.distance || 10;
        const angle = primitive.properties?.angle || 0;
        codeManager.addOperation(sketchName, 'polarLine', [distance, angle]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'polarline', points, properties };
    }
};

export const tangentLineTool: Tool = {
    metadata: {
        id: 'tangentline',
        label: 'Tangent Line',
        icon: 'CornerUpRight',
        category: 'sketch',
        group: 'Line',
        description: 'Draw a line tangent to the previous curve'
    },
    uiProperties: [
        { key: 'distance', label: 'Distance', type: 'number', default: 10, unit: 'mm' }
    ],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const distance = primitive.properties?.distance || 10;
        codeManager.addOperation(sketchName, 'tangentLine', [distance]);
    },
    processPoints(points: [number, number][], properties?: Record<string, any>): SketchPrimitiveData {
        return { id: generateToolId(), type: 'tangentline', points, properties };
    }
};

export const movePointerTool: Tool = {
    metadata: {
        id: 'movePointer',
        label: 'Move Pointer',
        icon: 'MousePointer',
        category: 'sketch',
        group: 'Line',
        description: 'Move the drawing pointer without creating a line'
    },
    uiProperties: [],
    addToSketch(codeManager: CodeManager, sketchName: string, primitive: SketchPrimitiveData): void {
        const pt = primitive.points[0];
        codeManager.addOperation(sketchName, 'movePointerTo', [[pt[0], pt[1]]]);
    },
    processPoints(points: [number, number][]): SketchPrimitiveData {
        return { id: generateToolId(), type: 'movePointer', points };
    }
};

import type { Tool, ToolContext } from '../../../types';

export const sphereTool: Tool = {
    metadata: {
        id: 'sphere',
        label: 'Sphere',
        icon: 'Globe',
        category: 'primitive',
        description: 'Create a sphere'
    },
    uiProperties: [
        { key: 'radius', label: 'Radius', type: 'number', default: 10, unit: 'mm', min: 0.1, step: 0.5 }
    ],
    create(context: ToolContext): string {
        const { radius = 10 } = context.params;
        return context.codeManager.addFeature('makeSphere', null, [radius]);
    }
};

export default sphereTool;

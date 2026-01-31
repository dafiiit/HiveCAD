import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';

export const torusTool: Tool = {
    metadata: {
        id: 'torus',
        label: 'Torus',
        icon: 'Circle', // Using Circle as a fallback, ideally would use Donut
        category: 'primitive',
        description: 'Create a torus (donut shape)'
    },
    uiProperties: [
        { key: 'radius', label: 'Major Radius', type: 'number', default: 10, unit: 'mm', min: 0.1, step: 0.5 },
        { key: 'tube', label: 'Tube Radius', type: 'number', default: 2, unit: 'mm', min: 0.1, step: 0.5 }
    ],
    create(codeManager: CodeManager, params: Record<string, any>): string {
        const { radius = 10, tube = 2 } = params;
        // Torus via revolve: drawCircle(tube).translate(radius, 0).sketchOnPlane("XZ").revolve()
        const sketchName = codeManager.addFeature('drawCircle', null, [tube]);
        codeManager.addOperation(sketchName, 'translate', [radius, 0]);
        codeManager.addOperation(sketchName, 'sketchOnPlane', ["XZ"]);
        codeManager.addOperation(sketchName, 'revolve', []);
        return sketchName;
    }
};

export default torusTool;

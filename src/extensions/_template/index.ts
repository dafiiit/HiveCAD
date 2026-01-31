/**
 * Template Extension for HiveCAD
 * 
 * This is a starting point for creating your own extension.
 * Copy this folder, rename it, and modify the files to create your extension.
 * 
 * See EXTENSION_GUIDE.md for detailed documentation.
 */

import type { Extension } from '@/lib/extensions';
import type { Tool } from '@/lib/tools/types';
import type { CodeManager } from '@/lib/code-manager';
import manifest from './extension.json';

/**
 * Define the tool capabilities for this extension.
 * 
 * A tool provides:
 * - metadata: icon, label, category for the toolbar
 * - uiProperties: parameters shown in the OperationProperties panel
 * - create(): function to generate CAD geometry
 * - renderPreview(): (optional) custom 3D preview while drawing
 */
const tool: Tool = {
    metadata: {
        id: manifest.id,
        label: manifest.name,
        icon: manifest.icon,
        category: manifest.category as any,
        description: manifest.description,
    },

    // Define parameters for the OperationProperties panel
    uiProperties: [
        {
            key: 'width',
            label: 'Width',
            type: 'number',
            default: 10,
            unit: 'mm',
            min: 0.1,
            step: 0.5
        },
        {
            key: 'height',
            label: 'Height',
            type: 'number',
            default: 10,
            unit: 'mm',
            min: 0.1,
            step: 0.5
        },
        {
            key: 'centered',
            label: 'Centered',
            type: 'boolean',
            default: true
        }
    ],

    /**
     * Create the CAD geometry using the CodeManager.
     * This modifies the code in the editor to add the feature.
     * 
     * @param codeManager - AST manipulation for the code editor
     * @param params - Parameter values from uiProperties
     * @returns The feature name/ID created
     */
    create(codeManager: CodeManager, params: Record<string, any>): string {
        const { width = 10, height = 10, centered = true } = params;

        // Use codeManager to add CAD operations
        // This example creates a simple box using replicad's makeBaseBox
        return codeManager.addFeature('makeBaseBox', null, [width, height, width]);
    },

    // Optional: Custom 3D preview while creating/editing
    // renderPreview(primitive, to3D, isGhost) {
    //     return null;
    // }
};

/**
 * The extension object that gets registered with HiveCAD.
 */
export const extension: Extension = {
    manifest: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        icon: manifest.icon,
        category: manifest.category as any,
    },
    tool,

    // Optional: Define a schema for extension-specific data on CADObjects
    // dataSchema: {
    //     properties: {
    //         customProperty: { type: 'number', default: 0 }
    //     }
    // },

    // Optional: Lifecycle hooks
    onRegister() {
        console.log(`[${manifest.name}] Extension registered`);
    },

    onUnregister() {
        console.log(`[${manifest.name}] Extension unregistered`);
    }
};

export default extension;

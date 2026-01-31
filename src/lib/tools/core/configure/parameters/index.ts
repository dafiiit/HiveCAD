import type { Tool } from '../../../types';

export const parametersTool: Tool = {
    metadata: {
        id: 'parameters',
        label: 'Parameters',
        icon: 'Settings2',
        category: 'modify', // Using modify since 'configure' might not be in ToolCategory
        description: 'Edit feature parameters',
        shortcut: 'P'
    },
    uiProperties: [],
    selectionRequirements: {
        min: 1,
        max: 1,
        allowedTypes: ['solid', 'sketch']
    }
    // Note: Opens the OperationProperties panel for the selected feature
};

export default parametersTool;

import type { Tool, ToolContext } from './types';

export function invokeToolCreate(tool: Tool, context: ToolContext): string {
    if (!tool.create) {
        throw new Error(`Tool "${tool.metadata.id}" does not implement create()`);
    }

    return tool.create(context);
}

export function invokeToolExecute(tool: Tool, context: ToolContext): void {
    if (!tool.execute) {
        throw new Error(`Tool "${tool.metadata.id}" does not implement execute()`);
    }

    tool.execute(context);
}

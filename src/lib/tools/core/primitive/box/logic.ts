import type { CodeManager } from '../../../../code-manager';

export interface BoxParams {
    width?: number;
    height?: number;
    depth?: number;
}

export function normalizeBoxParams(params: BoxParams): Required<BoxParams> {
    return {
        width: params.width ?? 10,
        height: params.height ?? 10,
        depth: params.depth ?? 10,
    };
}

export function generateBoxCodeSnapshot(params: BoxParams): string {
    const normalized = normalizeBoxParams(params);
    return `makeBaseBox(${normalized.width}, ${normalized.depth}, ${normalized.height})`;
}

export function applyBoxFeature(codeManager: CodeManager, params: BoxParams): string {
    const normalized = normalizeBoxParams(params);
    return codeManager.addFeature('makeBaseBox', null, [normalized.width, normalized.depth, normalized.height]);
}

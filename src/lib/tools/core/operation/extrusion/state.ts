import type { ExtrusionParams } from './logic';

export type ExtrusionState = Required<Pick<ExtrusionParams, 'distance' | 'operation' | 'endFactor'>> & {
    profile: string | null;
    axis: ExtrusionParams['axis'];
    twistAngle: number;
};

export const DEFAULT_EXTRUSION_STATE: ExtrusionState = {
    profile: null,
    axis: null,
    distance: 10,
    operation: 'new',
    twistAngle: 0,
    endFactor: 1,
};

export function reduceExtrusionState(
    state: ExtrusionState,
    updates: Partial<ExtrusionState>,
): ExtrusionState {
    return {
        ...state,
        ...updates,
    };
}

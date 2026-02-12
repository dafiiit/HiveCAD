import { create } from 'zustand';
import { CADState } from './types';
import { createObjectSlice } from './slices/objectSlice';
import { createViewSlice } from './slices/viewSlice';
import { createSolverSlice } from './slices/solverSlice';
import { createVersioningSlice } from './slices/versioningSlice';
import { createSketchSlice } from './slices/sketchSlice';
import { createSnappingSlice } from './slices/snappingSlice';
import { createToolbarSlice } from './slices/toolbarSlice';
import { buildHydratedPatch, type CADStateFixture } from './hydration';

// Re-export types for backward compatibility
export * from './types';

export const createCADStore = (initialState?: CADStateFixture) => create<CADState>((...a) => {
    const baseState = {
        ...createObjectSlice(...a),
        ...createViewSlice(...a),
        ...createSolverSlice(...a),
        ...createVersioningSlice(...a),
        ...createSketchSlice(...a),
        ...createSnappingSlice(...a),
        ...createToolbarSlice(...a),
    };

    if (!initialState) return baseState;

    return {
        ...baseState,
        ...buildHydratedPatch(initialState),
    };
});

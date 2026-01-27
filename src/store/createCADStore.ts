import { create } from 'zustand';
import { CADState } from './types';
import { createObjectSlice } from './slices/objectSlice';
import { createViewSlice } from './slices/viewSlice';
import { createSolverSlice } from './slices/solverSlice';
import { createVersioningSlice } from './slices/versioningSlice';
import { createSketchSlice } from './slices/sketchSlice';
import { createSnappingSlice } from './slices/snappingSlice';

// Re-export types for backward compatibility
export * from './types';

export const createCADStore = () => create<CADState>((...a) => ({
    ...createObjectSlice(...a),
    ...createViewSlice(...a),
    ...createSolverSlice(...a),
    ...createVersioningSlice(...a),
    ...createSketchSlice(...a),
    ...createSnappingSlice(...a),
}));

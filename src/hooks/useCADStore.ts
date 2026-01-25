import { create } from 'zustand';
import { CADState } from '../store/types';
import { createObjectSlice } from '../store/slices/objectSlice';
import { createViewSlice } from '../store/slices/viewSlice';
import { createSolverSlice } from '../store/slices/solverSlice';
import { createVersioningSlice } from '../store/slices/versioningSlice';
import { createSketchSlice } from '../store/slices/sketchSlice';
import { createSnappingSlice } from '../store/slices/snappingSlice';
import { createAuthSlice } from '../store/slices/authSlice';

// Re-export types for backward compatibility
export * from '../store/types';

export const useCADStore = create<CADState>((...a) => ({
  ...createObjectSlice(...a),
  ...createViewSlice(...a),
  ...createSolverSlice(...a),
  ...createVersioningSlice(...a),
  ...createSketchSlice(...a),
  ...createSnappingSlice(...a),
  ...createAuthSlice(...a),
}));

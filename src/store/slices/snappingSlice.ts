import { StateCreator } from 'zustand';
import { CADState, SnappingSlice } from '../types';

export const createSnappingSlice: StateCreator<
    CADState,
    [],
    [],
    SnappingSlice
> = (set) => ({
    activeSnapPoint: null,
    snappingEnabled: true,
    snappingEngine: null,

    setSnapPoint: (point) => set({ activeSnapPoint: point }),
    toggleSnapping: () => set(state => ({ snappingEnabled: !state.snappingEnabled })),
    setSnappingEngine: (engine) => set({ snappingEngine: engine }),
});

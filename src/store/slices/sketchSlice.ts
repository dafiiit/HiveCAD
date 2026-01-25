import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { processSketch } from '../../lib/sketch-processor';
import { CADState, SketchSlice } from '../types';

export const createSketchSlice: StateCreator<
    CADState,
    [],
    [],
    SketchSlice
> = (set, get) => ({
    isSketchMode: false,
    sketchPlane: null,
    sketchStep: 'select-plane',
    activeSketchPrimitives: [],
    currentDrawingPrimitive: null,
    lockedValues: {},
    sketchPoints: [],

    setSketchPlane: (plane) => set({ sketchPlane: plane, sketchStep: 'drawing' }),
    addSketchPoint: (point) => set(state => ({ sketchPoints: [...state.sketchPoints, point] })),

    addSketchPrimitive: (primitive) => set(state => ({
        activeSketchPrimitives: [...state.activeSketchPrimitives, primitive]
    })),

    updateCurrentDrawingPrimitive: (primitive) => set({ currentDrawingPrimitive: primitive }),
    clearSketch: () => set({ sketchPoints: [], activeSketchPrimitives: [], currentDrawingPrimitive: null }),

    enterSketchMode: () => {
        const state = get();
        // Ensure solver is initialized when entering sketch mode
        state.initializeSolver();

        set({
            isSketchMode: true,
            sketchStep: 'select-plane',
            sketchPlane: null,
            activeTab: 'SKETCH',
            activeTool: 'line',
            activeSketchPrimitives: [],
            currentDrawingPrimitive: null,
            sketchPoints: [],
            isSaved: false,
        });
    },

    exitSketchMode: () => {
        set({
            isSketchMode: false,
            sketchPoints: [],
            activeSketchPrimitives: [],
            currentDrawingPrimitive: null,
            sketchPlane: null,
            activeTab: 'SOLID',
            activeTool: 'select'
        });
    },

    finishSketch: () => {
        const state = get();
        const { activeSketchPrimitives, sketchEntities, solverInstance, sketchPlane, code } = state;

        const result = processSketch({
            activeSketchPrimitives,
            sketchEntities,
            solverInstance,
            sketchPlane,
            code
        });

        if (result.error) {
            toast.error(result.error);
            return;
        }

        if (!result.sketchName) {
            // No sketch created (maybe just open wire or empty)
            // processSketch handles "wires" now, so if names are null it means empty.
            // Wait, processSketch returns name even for wires.
            // If syncedPrimitives.length === 0, it returns null.

            if (activeSketchPrimitives.length === 0) {
                set({
                    isSketchMode: false,
                    sketchPoints: [],
                    activeSketchPrimitives: [],
                    currentDrawingPrimitive: null,
                    sketchPlane: null,
                    activeTab: 'SOLID',
                    activeTool: 'select',
                    lockedValues: {}
                });
                return;
            }
        }

        // Success - Code was updated in result.code
        set({
            code: result.code,
            isSketchMode: false,
            sketchPoints: [],
            activeSketchPrimitives: [],
            currentDrawingPrimitive: null,
            sketchPlane: null,
            activeTab: 'SOLID',
            activeTool: 'select',
            lockedValues: {}
        });

        get().runCode();
    },

    setSketchInputLock: (key, value) => {
        set(state => ({
            lockedValues: { ...state.lockedValues, [key]: value }
        }));
    },

    clearSketchInputLocks: () => set({ lockedValues: {} }),
});

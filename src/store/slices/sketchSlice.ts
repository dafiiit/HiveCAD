import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { CADState, SketchSlice } from '../types';
import {
    createSketchObject,
    generateEntityId,
    serializeSketch,
    deserializeSketch,
    generateSketchCode,
    type SketchObject,
    type SketchEntity,
    type SerializedSketch,
} from '../../lib/sketch';

/**
 * Convert a legacy SketchPrimitive to the new SketchEntity format.
 */
function primitiveToEntity(prim: any): SketchEntity {
    const props = prim.properties ?? {};

    // Derive controlPoints from tool-specific property names so the code
    // generator / renderer can always find them in a single canonical place.
    let controlPoints = props.controlPoints as Array<[number, number]> | undefined;

    if (!controlPoints) {
        const start = prim.points?.[0] as [number, number] | undefined;
        const end   = prim.points?.[1] as [number, number] | undefined;

        if (prim.type === 'quadraticBezier' && start && end) {
            // quadraticBezier stores ctrlX/ctrlY as offsets from start
            const cx = props.ctrlX ?? 0;
            const cy = props.ctrlY ?? 0;
            controlPoints = [[start[0] + cx, start[1] + cy]];
        } else if (prim.type === 'bezier' && prim.points?.[2]) {
            // bezier tool uses 3 points: start, end, controlPoint
            controlPoints = [prim.points[2] as [number, number]];
        } else if (prim.type === 'cubicBezier' && start && end) {
            // cubicBezier stores ctrlStartX/Y and ctrlEndX/Y as offsets
            const cs: [number, number] = [
                start[0] + (props.ctrlStartX ?? 0),
                start[1] + (props.ctrlStartY ?? 0),
            ];
            const ce: [number, number] = [
                end[0] + (props.ctrlEndX ?? 0),
                end[1] + (props.ctrlEndY ?? 0),
            ];
            controlPoints = [cs, ce];
        }
    }

    const isConstruction = prim.type === 'constructionLine' || prim.type === 'constructionCircle'
        || props.construction === true;

    return {
        id: prim.id ?? generateEntityId(),
        type: prim.type === 'threePointsArc' ? 'arc' : prim.type,
        points: prim.points,
        construction: isConstruction,
        properties: {
            sides: props.sides,
            sagitta: props.sagitta,
            radius: props.radius,
            cornerRadius: props.radius, // roundedRectangle
            text: props.text,
            fontSize: props.fontSize,
            fontFamily: props.fontFamily,
            startTangent: props.startTangent,
            endTangent: props.endTangent,
            startFactor: props.startFactor,
            endFactor: props.endFactor,
            controlPoints,
            solverId: props.solverId,
        }
    };
}

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
    sketchRedoPrimitives: [],
    currentDrawingPrimitive: null,
    lockedValues: {},
    sketchPoints: [],

    // New persistent sketch state
    sketches: new Map(),
    activeSketchId: null,
    chainMode: true,        // Auto-chain lines by default (like Fusion 360)
    gridSnapSize: 1,         // 1mm grid snap by default

    // Sketch interaction state
    hoveredPrimitiveId: null,
    draggingHandle: null,
    selectedPrimitiveIds: new Set<string>(),
    selectedHandleIds: new Set<string>(),

    setSketchPlane: (plane) => set({ sketchPlane: plane, sketchStep: 'drawing' }),
    addSketchPoint: (point) => set(state => ({ sketchPoints: [...state.sketchPoints, point] })),

    addSketchPrimitive: (primitive) => set(state => ({
        activeSketchPrimitives: [...state.activeSketchPrimitives, primitive],
        sketchRedoPrimitives: [],
    })),

    updateCurrentDrawingPrimitive: (primitive) => set({ currentDrawingPrimitive: primitive }),
    clearSketch: () => set({ sketchPoints: [], activeSketchPrimitives: [], sketchRedoPrimitives: [], currentDrawingPrimitive: null }),

    enterSketchMode: (sketchId?: string) => {
        const state = get();
        state.initializeSolver();

        if (sketchId) {
            // Re-editing an existing sketch
            const existingSketch = state.sketches.get(sketchId);
            if (existingSketch) {
                // Convert entities back to primitives for the drawing canvas
                const primitives = existingSketch.entities.map(entity => ({
                    id: entity.id,
                    type: entity.type === 'arc' ? 'threePointsArc' : entity.type,
                    points: entity.points,
                    properties: { ...entity.properties },
                }));

                set({
                    isSketchMode: true,
                    sketchStep: 'drawing',
                    sketchPlane: existingSketch.plane,
                    activeTab: 'SKETCH',
                    activeTool: 'line',
                    activeSketchPrimitives: primitives as any[],
                    sketchRedoPrimitives: [],
                    currentDrawingPrimitive: null,
                    sketchPoints: [],
                    activeSketchId: sketchId,
                    isSaved: false,
                });
                return;
            }
        }

        set({
            isSketchMode: true,
            sketchStep: 'select-plane',
            sketchPlane: null,
            activeTab: 'SKETCH',
            activeTool: 'line',
            activeSketchPrimitives: [],
            sketchRedoPrimitives: [],
            currentDrawingPrimitive: null,
            sketchPoints: [],
            activeSketchId: null,
            isSaved: false,
        });
    },

    exitSketchMode: () => {
        set({
            isSketchMode: false,
            sketchPoints: [],
            activeSketchPrimitives: [],
            sketchRedoPrimitives: [],
            currentDrawingPrimitive: null,
            sketchPlane: null,
            activeTab: 'SOLID',
            activeTool: 'select',
            activeSketchId: null,
            hoveredPrimitiveId: null,
            draggingHandle: null,
            selectedPrimitiveIds: new Set(),
        });
    },

    finishSketch: () => {
        const state = get();
        const { activeSketchPrimitives, sketchEntities, solverInstance, sketchPlane, code, activeSketchId } = state;

        if (activeSketchPrimitives.length === 0) {
            // Nothing to save — just exit
            set({
                isSketchMode: false,
                sketchPoints: [],
                activeSketchPrimitives: [],
                sketchRedoPrimitives: [],
                currentDrawingPrimitive: null,
                sketchPlane: null,
                activeTab: 'SOLID',
                activeTool: 'select',
                lockedValues: {},
                activeSketchId: null,
            });
            return;
        }

        // Convert primitives to persistent SketchEntity objects
        const entities: SketchEntity[] = activeSketchPrimitives.map(primitiveToEntity);

        // Create or update the persistent SketchObject
        const sketchObj: SketchObject = activeSketchId && state.sketches.has(activeSketchId)
            ? {
                ...state.sketches.get(activeSketchId)!,
                entities,
                updatedAt: Date.now(),
                isEditing: false,
            }
            : createSketchObject(sketchPlane ?? 'XY', undefined);

        if (!activeSketchId) {
            sketchObj.entities = entities;
            sketchObj.isEditing = false;
        }

        // Generate code from the persistent sketch
        const result = generateSketchCode(sketchObj, code);

        if (result.error) {
            toast.error(result.error);
            return;
        }

        sketchObj.featureId = result.featureId;

        // Save the sketch to the persistent map
        const newSketches = new Map(state.sketches);
        newSketches.set(sketchObj.id, sketchObj);

        // Success
        set({
            code: result.code,
            isSketchMode: false,
            sketchPoints: [],
            activeSketchPrimitives: [],
            sketchRedoPrimitives: [],
            currentDrawingPrimitive: null,
            sketchPlane: null,
            activeTab: 'SOLID',
            activeTool: 'select',
            lockedValues: {},
            activeSketchId: null,
            sketches: newSketches,
        });

        get().runCode();
        get().pushToHistory('sketch', sketchObj.name);
    },

    undoLastPrimitive: () => {
        set(state => {
            if (state.currentDrawingPrimitive) {
                // Cancel current drawing first
                return { currentDrawingPrimitive: null };
            }
            if (state.activeSketchPrimitives.length === 0) return {};
            const lastPrimitive = state.activeSketchPrimitives[state.activeSketchPrimitives.length - 1];
            return {
                activeSketchPrimitives: state.activeSketchPrimitives.slice(0, -1),
                sketchRedoPrimitives: [...state.sketchRedoPrimitives, lastPrimitive],
            };
        });
    },

    redoLastPrimitive: () => {
        set(state => {
            if (state.sketchRedoPrimitives.length === 0) return {};
            const primitiveToRestore = state.sketchRedoPrimitives[state.sketchRedoPrimitives.length - 1];
            return {
                activeSketchPrimitives: [...state.activeSketchPrimitives, primitiveToRestore],
                sketchRedoPrimitives: state.sketchRedoPrimitives.slice(0, -1),
                currentDrawingPrimitive: null,
            };
        });
    },

    setChainMode: (enabled) => set({ chainMode: enabled }),
    setGridSnapSize: (size) => set({ gridSnapSize: Math.max(0, size) }),

    editSketch: (sketchId: string) => {
        const state = get();
        const sketch = state.sketches.get(sketchId);
        if (!sketch) {
            toast.error(`Sketch "${sketchId}" not found`);
            return;
        }
        // Re-enter sketch mode with the existing sketch
        state.enterSketchMode(sketchId);
    },

    deleteSketch: (sketchId: string) => {
        const state = get();
        const newSketches = new Map(state.sketches);
        newSketches.delete(sketchId);
        set({ sketches: newSketches });
    },

    getSerializedSketches: () => {
        const state = get();
        return Array.from(state.sketches.values()).map(serializeSketch);
    },

    loadSketches: (serialized: SerializedSketch[]) => {
        const newSketches = new Map<string, SketchObject>();
        for (const s of serialized) {
            newSketches.set(s.id, deserializeSketch(s));
        }
        set({ sketches: newSketches });
    },

    setSketchInputLock: (key, value) => {
        set(state => ({
            lockedValues: { ...state.lockedValues, [key]: value }
        }));
    },

    clearSketchInputLocks: () => set({ lockedValues: {} }),

    // ── Sketch Interaction Methods ────────────────────────────

    setHoveredPrimitive: (id) => set({ hoveredPrimitiveId: id }),

    setDraggingHandle: (handle) => set({ draggingHandle: handle }),

    selectPrimitive: (id, multiSelect = false) => {
        set(state => {
            // If single-select mode and clicking the only selected item, deselect it
            if (!multiSelect && state.selectedPrimitiveIds.size === 1 && state.selectedPrimitiveIds.has(id)) {
                return { selectedPrimitiveIds: new Set() };
            }
            
            const newSelection = new Set(multiSelect ? state.selectedPrimitiveIds : []);
            if (newSelection.has(id)) {
                newSelection.delete(id); // Toggle off in multi-select mode
            } else {
                newSelection.add(id);
            }
            return { selectedPrimitiveIds: newSelection };
        });
    },

    clearPrimitiveSelection: () => set({ selectedPrimitiveIds: new Set() }),

    selectHandle: (handleId, multiSelect = false) => {
        set(state => {
            // If single-select mode and clicking the only selected handle, deselect it
            if (!multiSelect && state.selectedHandleIds.size === 1 && state.selectedHandleIds.has(handleId)) {
                return { selectedHandleIds: new Set() };
            }
            
            const newSelection = new Set(multiSelect ? state.selectedHandleIds : []);
            if (newSelection.has(handleId)) {
                newSelection.delete(handleId); // Toggle off in multi-select mode
            } else {
                newSelection.add(handleId);
            }
            return { selectedHandleIds: newSelection };
        });
    },

    clearHandleSelection: () => set({ selectedHandleIds: new Set() }),

    updatePrimitivePoint: (primitiveId, pointIndex, newPoint) => {
        set(state => ({
            activeSketchPrimitives: state.activeSketchPrimitives.map(prim => {
                if (prim.id !== primitiveId) return prim;
                const newPoints = [...prim.points];
                if (pointIndex >= 0 && pointIndex < newPoints.length) {
                    newPoints[pointIndex] = newPoint;
                }
                return { ...prim, points: newPoints };
            }),
        }));
    },

    togglePrimitiveConstruction: (primitiveId) => {
        set(state => ({
            activeSketchPrimitives: state.activeSketchPrimitives.map(prim => {
                if (prim.id !== primitiveId) return prim;
                const isConst = prim.type === 'constructionLine' || prim.type === 'constructionCircle'
                    || prim.properties?.construction === true;
                return {
                    ...prim,
                    properties: {
                        ...prim.properties,
                        construction: !isConst,
                    },
                };
            }),
        }));
    },
});

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
import {
    buildPrimitiveCoincidentConstraintId,
    buildPrimitivePointOnLineConstraintId,
    findPrimitivePointOnLineConstraint,
    findPrimitiveLineConstraint,
    hasPrimitiveCoincidentConstraint,
    isPrimitiveCoincidentConstraint,
    isPrimitivePointOnLineConstraint,
} from '../../lib/sketch/primitiveConstraints';

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

/**
 * Return the point indices that are considered "connectable endpoints" for a
 * given primitive type.  Coincident constraints can only be auto-detected and
 * propagated at these indices.
 */
function getEndpointIndices(primitive: { type: string; points: [number, number][] }): number[] {
    switch (primitive.type) {
        case 'line':
        case 'constructionLine':
        case 'vline':
        case 'hline':
        case 'polarline':
        case 'tangentline':
            return primitive.points.length >= 2 ? [0, primitive.points.length - 1] : [];
        case 'threePointsArc':
            // Points: [start, end, via] — only start and end are "connectable"
            return primitive.points.length >= 2 ? [0, 1] : [];
        case 'centerPointArc':
            // Points: [center, start, end] — only start and end are "connectable"
            return primitive.points.length >= 3 ? [1, 2] : [];
        default:
            return [];
    }
}

function isSamePoint(a: [number, number], b: [number, number], epsilon = 1e-9): boolean {
    return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function isLineLikePrimitive(primitive: { type: string; points: [number, number][] } | undefined): boolean {
    if (!primitive) return false;
    return ['line', 'constructionLine', 'vline', 'hline', 'polarline', 'tangentline'].includes(primitive.type)
        && primitive.points.length >= 2;
}

/** Distance between two 2D points */
function dist2D(a: [number, number], b: [number, number]): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function projectPointToLineSegment(
    point: [number, number],
    start: [number, number],
    end: [number, number],
): { point: [number, number]; t: number } {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lenSq = dx * dx + dy * dy;

    if (lenSq <= 1e-12) {
        return { point: start, t: 0 };
    }

    const t = clamp01(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lenSq);
    return {
        point: [start[0] + dx * t, start[1] + dy * t],
        t,
    };
}

/** Threshold (sketch units) below which two endpoints are considered coincident */
const COINCIDENT_THRESHOLD = 0.05;

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

    // Coincident constraints between primitive endpoints
    primitiveCoincidents: new Map<string, Set<string>>(),

    setSketchPlane: (plane) => set({ sketchPlane: plane, sketchStep: 'drawing' }),
    addSketchPoint: (point) => set(state => ({ sketchPoints: [...state.sketchPoints, point] })),

    addSketchPrimitive: (primitive) => {
        const state = get();
        const existing = state.activeSketchPrimitives;

        // Auto-detect coincident endpoint pairs with existing primitives
        const newCoincidents = new Map<string, Set<string>>(state.primitiveCoincidents);
        const newConstraints = [...state.sketchConstraints];

        const addLink = (k1: string, k2: string) => {
            if (!newCoincidents.has(k1)) newCoincidents.set(k1, new Set());
            if (!newCoincidents.has(k2)) newCoincidents.set(k2, new Set());
            newCoincidents.get(k1)!.add(k2);
            newCoincidents.get(k2)!.add(k1);

            if (!hasPrimitiveCoincidentConstraint(newConstraints, k1, k2)) {
                newConstraints.push({
                    id: buildPrimitiveCoincidentConstraintId(k1, k2),
                    type: 'coincident',
                    entityIds: [k1, k2],
                    driving: true,
                });
            }
        };

        const newEndpointIndices = getEndpointIndices(primitive);
        for (const newIdx of newEndpointIndices) {
            const newPt = primitive.points[newIdx];
            if (!newPt) continue;
            const newKey = `${primitive.id}:${newIdx}`;

            for (const existingPrim of existing) {
                const existingIndices = getEndpointIndices(existingPrim);
                for (const existingIdx of existingIndices) {
                    const existingPt = existingPrim.points[existingIdx];
                    if (!existingPt) continue;
                    if (dist2D(newPt, existingPt) <= COINCIDENT_THRESHOLD) {
                        addLink(newKey, `${existingPrim.id}:${existingIdx}`);
                    }
                }
            }
        }

        set(s => ({
            activeSketchPrimitives: [...s.activeSketchPrimitives, primitive],
            sketchRedoPrimitives: [],
            primitiveCoincidents: newCoincidents,
            sketchConstraints: newConstraints,
        }));
    },

    updateCurrentDrawingPrimitive: (primitive) => set({ currentDrawingPrimitive: primitive }),
    clearSketch: () => set({ sketchPoints: [], activeSketchPrimitives: [], sketchRedoPrimitives: [], currentDrawingPrimitive: null, primitiveCoincidents: new Map() }),

    enterSketchMode: (sketchId?: string) => {
        const state = get();
        state.clearSolver();
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
                    primitiveCoincidents: new Map(),
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
            primitiveCoincidents: new Map(),
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

            // Clean up coincident links for the removed primitive
            const newCoincidents = new Map<string, Set<string>>(state.primitiveCoincidents);
            for (const [key, partners] of newCoincidents) {
                if (key.startsWith(`${lastPrimitive.id}:`)) {
                    // Remove this key and back-references from all partners
                    for (const partnerKey of partners) {
                        const partnerSet = newCoincidents.get(partnerKey);
                        if (partnerSet) {
                            partnerSet.delete(key);
                            if (partnerSet.size === 0) newCoincidents.delete(partnerKey);
                        }
                    }
                    newCoincidents.delete(key);
                }
            }

            return {
                activeSketchPrimitives: state.activeSketchPrimitives.slice(0, -1),
                sketchRedoPrimitives: [...state.sketchRedoPrimitives, lastPrimitive],
                primitiveCoincidents: newCoincidents,
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

    selectPrimitive: (id) => {
        set(state => {
            if (state.selectedPrimitiveIds.has(id)) {
                return state;
            }

            const newSelection = new Set(state.selectedPrimitiveIds);
            newSelection.add(id);
            return { selectedPrimitiveIds: newSelection };
        });
    },

    clearPrimitiveSelection: () => set({ selectedPrimitiveIds: new Set() }),

    selectHandle: (handleId) => {
        set(state => {
            if (state.selectedHandleIds.has(handleId)) {
                return state;
            }

            const newSelection = new Set(state.selectedHandleIds);
            newSelection.add(handleId);
            return { selectedHandleIds: newSelection };
        });
    },

    clearHandleSelection: () => set({ selectedHandleIds: new Set() }),

    updatePrimitivePoint: (primitiveId, pointIndex, newPoint) => {
        const state = get();
        const { primitiveCoincidents } = state;
        const primitiveMap = new Map(state.activeSketchPrimitives.map(prim => [prim.id, prim]));
        const attachmentValueUpdates = new Map<string, number>();

        const attachmentsByTargetPrimitive = new Map<string, Array<{
            id: string;
            type: 'pointOnLine';
            entityIds: [string, string];
            value?: number;
        }>>();
        for (const constraint of state.sketchConstraints) {
            if (!isPrimitivePointOnLineConstraint(constraint)) continue;
            const targetPrimitiveId = constraint.entityIds[1];
            const existing = attachmentsByTargetPrimitive.get(targetPrimitiveId);
            if (existing) {
                existing.push(constraint);
            } else {
                attachmentsByTargetPrimitive.set(targetPrimitiveId, [constraint]);
            }
        }

        // Collect all point updates via graph propagation over coincident links
        // plus primitive horizontal/vertical constraints.
        // Map<primitiveId, Map<pointIndex, newPoint>>
        const updates = new Map<string, Map<number, [number, number]>>();

        const getPoint = (primId: string, idx: number): [number, number] | null => {
            const pending = updates.get(primId)?.get(idx);
            if (pending) return pending;
            const primitive = primitiveMap.get(primId);
            return primitive?.points[idx] ?? null;
        };

        const projectAttachedPoint = (
            pointKey: string,
            desiredPoint: [number, number],
            useStoredValue: boolean,
        ): [number, number] => {
            const constraint = findPrimitivePointOnLineConstraint(state.sketchConstraints, pointKey);
            if (!constraint) return desiredPoint;

            const targetPrimitive = primitiveMap.get(constraint.entityIds[1]);
            if (!isLineLikePrimitive(targetPrimitive)) return desiredPoint;

            const start = getPoint(targetPrimitive.id, 0);
            const end = getPoint(targetPrimitive.id, targetPrimitive.points.length - 1);
            if (!start || !end) return desiredPoint;

            const projected = useStoredValue && constraint.value != null
                ? {
                    point: [
                        start[0] + (end[0] - start[0]) * clamp01(constraint.value),
                        start[1] + (end[1] - start[1]) * clamp01(constraint.value),
                    ] as [number, number],
                    t: clamp01(constraint.value),
                }
                : projectPointToLineSegment(desiredPoint, start, end);

            attachmentValueUpdates.set(constraint.id, projected.t);
            return projected.point;
        };

        const enqueue = (primId: string, idx: number, pt: [number, number], useStoredAttachmentValue = false) => {
            const normalizedPoint = projectAttachedPoint(`${primId}:${idx}`, pt, useStoredAttachmentValue);

            if (!updates.has(primId)) updates.set(primId, new Map());
            const existing = updates.get(primId)!.get(idx);
            if (existing && isSamePoint(existing, normalizedPoint)) return;
            updates.get(primId)!.set(idx, normalizedPoint);

            // Propagate to coincident partners
            const key = `${primId}:${idx}`;
            const partners = primitiveCoincidents.get(key);
            if (partners) {
                for (const partnerKey of partners) {
                    const colonIdx = partnerKey.lastIndexOf(':');
                    const partnerPrimId = partnerKey.slice(0, colonIdx);
                    const partnerIdx = parseInt(partnerKey.slice(colonIdx + 1), 10);
                    enqueue(partnerPrimId, partnerIdx, normalizedPoint, useStoredAttachmentValue);
                }
            }

            const dependentAttachments = attachmentsByTargetPrimitive.get(primId) ?? [];
            for (const attachment of dependentAttachments) {
                const sourceKey = attachment.entityIds[0];
                const colonIdx = sourceKey.lastIndexOf(':');
                const sourcePrimId = sourceKey.slice(0, colonIdx);
                const sourceIdx = parseInt(sourceKey.slice(colonIdx + 1), 10);
                const currentSourcePoint = getPoint(sourcePrimId, sourceIdx) ?? primitiveMap.get(sourcePrimId)?.points[sourceIdx];
                if (!currentSourcePoint) continue;
                enqueue(sourcePrimId, sourceIdx, currentSourcePoint, true);
            }

            const primitive = primitiveMap.get(primId);
            const lineConstraint = findPrimitiveLineConstraint(state.sketchConstraints, primId);
            if (!lineConstraint || !isLineLikePrimitive(primitive)) return;

            const endpointIndices = getEndpointIndices(primitive);
            if (endpointIndices.length !== 2 || !endpointIndices.includes(idx)) return;

            const otherIdx = endpointIndices[0] === idx ? endpointIndices[1] : endpointIndices[0];
            const otherPoint = getPoint(primId, otherIdx);
            if (!otherPoint) return;

            const constrainedPoint: [number, number] =
                lineConstraint === 'horizontal'
                    ? [otherPoint[0], normalizedPoint[1]]
                    : [normalizedPoint[0], otherPoint[1]];

            enqueue(primId, otherIdx, constrainedPoint);
        };

        enqueue(primitiveId, pointIndex, newPoint);

        // Apply all updates in a single set call to avoid intermediate re-renders
        set(s => ({
            activeSketchPrimitives: s.activeSketchPrimitives.map(prim => {
                const primUpdates = updates.get(prim.id);
                if (!primUpdates) return prim;
                const newPoints = [...prim.points] as [number, number][];
                for (const [idx, pt] of primUpdates) {
                    if (idx >= 0 && idx < newPoints.length) {
                        newPoints[idx] = pt;
                    }
                }
                return { ...prim, points: newPoints };
            }),
            sketchConstraints: attachmentValueUpdates.size === 0
                ? s.sketchConstraints
                : s.sketchConstraints.map(constraint => {
                    const nextValue = attachmentValueUpdates.get(constraint.id);
                    return nextValue == null ? constraint : { ...constraint, value: nextValue };
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

    addPrimitiveCoincident: (key1, key2) => {
        set(state => {
            const newCoincidents = new Map<string, Set<string>>(state.primitiveCoincidents);
            if (!newCoincidents.has(key1)) newCoincidents.set(key1, new Set());
            if (!newCoincidents.has(key2)) newCoincidents.set(key2, new Set());
            newCoincidents.get(key1)!.add(key2);
            newCoincidents.get(key2)!.add(key1);

            const nextConstraints = hasPrimitiveCoincidentConstraint(state.sketchConstraints, key1, key2)
                ? state.sketchConstraints
                : [...state.sketchConstraints, {
                    id: buildPrimitiveCoincidentConstraintId(key1, key2),
                    type: 'coincident',
                    entityIds: [key1, key2],
                    driving: true,
                }];

            return {
                primitiveCoincidents: newCoincidents,
                sketchConstraints: nextConstraints,
            };
        });
    },

    setPrimitivePointOnLine: (pointKey, primitiveId, value) => {
        set(state => {
            const nextConstraints = state.sketchConstraints.filter(constraint => {
                return !(isPrimitivePointOnLineConstraint(constraint) && constraint.entityIds[0] === pointKey);
            });

            nextConstraints.push({
                id: buildPrimitivePointOnLineConstraintId(pointKey, primitiveId),
                type: 'pointOnLine',
                entityIds: [pointKey, primitiveId],
                value: value != null ? clamp01(value) : value,
                driving: true,
            });

            return {
                sketchConstraints: nextConstraints,
            };
        });
    },

    removePrimitiveCoincidentLink: (key1, key2) => {
        set(state => {
            const newCoincidents = new Map<string, Set<string>>(state.primitiveCoincidents);
            const set1 = newCoincidents.get(key1);
            const set2 = newCoincidents.get(key2);

            if (set1) {
                set1.delete(key2);
                if (set1.size === 0) newCoincidents.delete(key1);
            }
            if (set2) {
                set2.delete(key1);
                if (set2.size === 0) newCoincidents.delete(key2);
            }

            return {
                primitiveCoincidents: newCoincidents,
                sketchConstraints: state.sketchConstraints.filter(constraint => constraint.id !== buildPrimitiveCoincidentConstraintId(key1, key2)),
            };
        });
    },

    removePrimitiveCoincidents: (primitiveId) => {
        set(state => {
            const newCoincidents = new Map<string, Set<string>>(state.primitiveCoincidents);
            const removedKeys = new Set<string>();
            for (const [key, partners] of newCoincidents) {
                if (key.startsWith(`${primitiveId}:`)) {
                    removedKeys.add(key);
                    for (const partnerKey of partners) {
                        const partnerSet = newCoincidents.get(partnerKey);
                        if (partnerSet) {
                            partnerSet.delete(key);
                            if (partnerSet.size === 0) newCoincidents.delete(partnerKey);
                        }
                    }
                    newCoincidents.delete(key);
                }
            }

            const nextConstraints = state.sketchConstraints.filter(constraint => {
                if (!isPrimitiveCoincidentConstraint(constraint)) return true;
                return !constraint.entityIds.some(entityId => removedKeys.has(entityId) || entityId.startsWith(`${primitiveId}:`));
            }).filter(constraint => {
                if (!isPrimitivePointOnLineConstraint(constraint)) return true;
                return !constraint.entityIds[0].startsWith(`${primitiveId}:`) && constraint.entityIds[1] !== primitiveId;
            });

            return {
                primitiveCoincidents: newCoincidents,
                sketchConstraints: nextConstraints,
            };
        });
    },
});

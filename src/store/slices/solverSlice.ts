import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import {
    ConstraintSolver,
    EntityId,
    SolverEntity,
    ConstraintType,
    CONSTRAINT_META,
    validateConstraintSelection,
    getNextSelectionPrompt,
} from '../../lib/solver';
import { CADState, SolverSlice } from '../types';

/**
 * Gather all selected solver entity IDs.
 * Merges both objectSlice.selectedIds AND sketchSlice.selectedPrimitiveIds,
 * filtering for only IDs that exist in the solver's sketchEntities map.
 */
function getSelectedSolverIds(state: CADState): EntityId[] {
    const { sketchEntities, selectedIds } = state;

    // Collect from objectSlice selectedIds (solver entity IDs stored directly)
    const fromSelected = Array.from(selectedIds).filter(id => sketchEntities.has(id));

    // Also collect from sketchSlice selectedPrimitiveIds by mapping through solverId
    const fromPrimitives: EntityId[] = [];
    if (state.selectedPrimitiveIds && state.selectedPrimitiveIds.size > 0) {
        for (const primId of state.selectedPrimitiveIds) {
            // Look up the primitive to get its solver entity mapping
            const prim = state.activeSketchPrimitives?.find(p => p.id === primId);
            if (prim?.properties?.solverEntityIds) {
                const entityIds = prim.properties.solverEntityIds as EntityId[];
                for (const eid of entityIds) {
                    if (sketchEntities.has(eid) && !fromSelected.includes(eid)) {
                        fromPrimitives.push(eid);
                    }
                }
            }
            if (prim?.properties?.solverId) {
                const sid = prim.properties.solverId as string;
                if (sketchEntities.has(sid) && !fromSelected.includes(sid) && !fromPrimitives.includes(sid)) {
                    fromPrimitives.push(sid);
                }
            }
            // The primitive ID itself might be a solver entity ID
            if (sketchEntities.has(primId) && !fromSelected.includes(primId) && !fromPrimitives.includes(primId)) {
                fromPrimitives.push(primId);
            }
        }
    }

    return [...new Set([...fromSelected, ...fromPrimitives])];
}

/**
 * Compute the default value for value-based constraints.
 */
function computeDefaultValue(
    type: ConstraintType,
    entityIds: EntityId[],
    solver: ConstraintSolver,
    entities: Map<EntityId, SolverEntity>,
): number | undefined {
    if (type === 'distance') {
        if (entityIds.length === 2) {
            const e1 = entities.get(entityIds[0]);
            const e2 = entities.get(entityIds[1]);
            if (e1?.type === 'point' && e2?.type === 'point') {
                return Math.sqrt(Math.pow(e2.x - e1.x, 2) + Math.pow(e2.y - e1.y, 2));
            }
        }
        if (entityIds.length === 1) {
            const e = entities.get(entityIds[0]);
            if (e?.type === 'line') {
                const p1 = solver.getPoint(e.p1Id);
                const p2 = solver.getPoint(e.p2Id);
                if (p1 && p2) {
                    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
                }
            }
        }
    }
    if (type === 'angle') return Math.PI / 2;
    if (type === 'radius') {
        const e = entities.get(entityIds[0]);
        if (e?.type === 'circle') return e.radius;
        if (e?.type === 'arc') {
            const center = solver.getPoint((e as any).centerId);
            const start = solver.getPoint((e as any).startId);
            if (center && start) {
                return Math.sqrt(Math.pow(start.x - center.x, 2) + Math.pow(start.y - center.y, 2));
            }
        }
    }
    return undefined;
}

/**
 * Reorder entity IDs based on constraint type requirements.
 */
function reorderEntityIds(
    type: ConstraintType,
    entityIds: EntityId[],
    entities: Map<EntityId, SolverEntity>,
): EntityId[] {
    switch (type) {
        case 'symmetric': {
            const points = entityIds.filter(id => entities.get(id)?.type === 'point');
            const lines = entityIds.filter(id => entities.get(id)?.type === 'line');
            return [...points, ...lines];
        }
        case 'concentric': {
            return entityIds.map(id => {
                const e = entities.get(id);
                if (e?.type === 'circle') return (e as any).centerId;
                if (e?.type === 'arc') return (e as any).centerId;
                return id;
            });
        }
        case 'pointOnLine':
        case 'midpoint': {
            const point = entityIds.find(id => entities.get(id)?.type === 'point');
            const line = entityIds.find(id => entities.get(id)?.type === 'line');
            if (point && line) return [point, line];
            return entityIds;
        }
        case 'pointOnCircle': {
            const point = entityIds.find(id => entities.get(id)?.type === 'point');
            const circ = entityIds.find(id => {
                const e = entities.get(id);
                return e?.type === 'circle' || e?.type === 'arc';
            });
            if (point && circ) return [point, circ];
            return entityIds;
        }
        case 'tangent': {
            const line = entityIds.find(id => entities.get(id)?.type === 'line');
            const circ = entityIds.find(id => {
                const e = entities.get(id);
                return e?.type === 'circle' || e?.type === 'arc';
            });
            if (line && circ) return [line, circ];
            return entityIds;
        }
        default:
            return entityIds;
    }
}

export const createSolverSlice: StateCreator<
    CADState,
    [],
    [],
    SolverSlice
> = (set, get) => ({
    solverInstance: null,
    sketchEntities: new Map(),
    sketchConstraints: [],
    draggingEntityId: null,
    activeConstraintType: null,
    constraintSelectionIds: [],
    constraintSelectionPrompt: null,

    initializeSolver: async () => {
        const state = get();
        if (state.solverInstance?.isInitialized) return;

        const solver = new ConstraintSolver();
        await solver.initialize();
        set({ solverInstance: solver });
    },

    addSolverPoint: (x, y, fixed = false) => {
        const { solverInstance } = get();
        if (!solverInstance?.isInitialized) {
            console.warn('Solver not initialized');
            return null;
        }

        const id = solverInstance.addPoint(x, y, fixed);
        const entity = solverInstance.getPoint(id);
        if (entity) {
            set(state => ({
                sketchEntities: new Map(state.sketchEntities).set(id, entity)
            }));
            // Auto-apply coincident if near another point
            setTimeout(() => get().autoApplyCoincident(id), 0);
        }
        return id;
    },

    addSolverLine: (p1Id, p2Id) => {
        const { solverInstance } = get();
        if (!solverInstance?.isInitialized) {
            console.warn('Solver not initialized');
            return null;
        }

        const id = solverInstance.addLine(p1Id, p2Id);
        const entity = solverInstance.getLine(id);
        if (entity) {
            set(state => ({
                sketchEntities: new Map(state.sketchEntities).set(id, entity)
            }));
        }
        return id;
    },

    addSolverConstraint: (type, entityIds, value) => {
        const { solverInstance } = get();
        if (!solverInstance?.isInitialized) {
            console.warn('Solver not initialized');
            return null;
        }

        const id = solverInstance.addConstraint(type, entityIds, value);
        const constraints = solverInstance.getAllConstraints();
        set({ sketchConstraints: constraints });
        return id;
    },

    removeSolverConstraint: (constraintId) => {
        const { solverInstance } = get();
        if (!solverInstance?.isInitialized) return;

        solverInstance.removeConstraint(constraintId);
        set(state => ({
            sketchConstraints: state.sketchConstraints.filter(c => c.id !== constraintId)
        }));

        // Re-solve after removing constraint
        const result = solverInstance.solve();
        if (result.success) {
            const entities = new Map<EntityId, SolverEntity>();
            solverInstance.getAllEntities().forEach(entity => {
                entities.set(entity.id, entity);
            });
            set({ sketchEntities: entities });
        }
    },

    setDrivingPoint: (id, x, y) => {
        const { solverInstance } = get();
        if (!solverInstance?.isInitialized) return;

        solverInstance.setDrivingPoint(id, x, y);
        set({ draggingEntityId: id });
    },

    solveConstraints: () => {
        const { solverInstance } = get();
        if (!solverInstance?.isInitialized) return null;

        const result = solverInstance.solve();

        if (result.success) {
            const entities = new Map<EntityId, SolverEntity>();
            solverInstance.getAllEntities().forEach(entity => {
                entities.set(entity.id, entity);
            });
            set({ sketchEntities: entities });
        }

        return result;
    },

    clearSolver: () => {
        const { solverInstance } = get();
        if (solverInstance) {
            solverInstance.clear();
        }
        set({
            sketchEntities: new Map(),
            sketchConstraints: [],
            draggingEntityId: null,
            activeConstraintType: null,
            constraintSelectionIds: [],
            constraintSelectionPrompt: null,
        });
    },

    setDraggingEntity: (id) => {
        set({ draggingEntityId: id });
        if (id === null) {
            const { solverInstance } = get();
            if (solverInstance) {
                solverInstance.clearAllDrivingPoints();
            }
        }
    },

    // ─── Select-first workflow ───────────────────────────────────
    applyConstraintToSelection: (type) => {
        const state = get();
        const { solverInstance, sketchEntities } = state;

        if (!solverInstance?.isInitialized) {
            toast.error('Solver not initialized');
            return;
        }

        const meta = CONSTRAINT_META[type];
        if (!meta) {
            toast.error(`Unknown constraint: ${type}`);
            return;
        }

        // Gather selected solver entities from both selection systems
        const ids = getSelectedSolverIds(state);

        if (ids.length === 0) {
            // No entities pre-selected → switch to constraint-first mode
            state.startConstraintMode(type);
            return;
        }

        // Validate selection
        const entityTypes = ids.map(id => ({
            id,
            type: sketchEntities.get(id)!.type,
        }));
        const validation = validateConstraintSelection(type, entityTypes);

        if (!validation.valid) {
            // Not enough / wrong types → show what's needed and switch to constraint-first mode
            toast.info(validation.errorMessage);
            state.startConstraintMode(type);
            return;
        }

        // Reorder IDs based on constraint type
        const orderedIds = reorderEntityIds(type, ids, sketchEntities);

        // Compute value for value-based constraints
        const value = computeDefaultValue(type, orderedIds, solverInstance, sketchEntities);

        // Add constraint to solver
        const cid = solverInstance.addConstraint(type, orderedIds, value);
        if (!cid) {
            toast.error('Failed to create constraint');
            return;
        }

        // Update store
        set(s => ({
            sketchConstraints: [...s.sketchConstraints, {
                id: cid, type, entityIds: orderedIds, value, driving: true,
            }],
        }));

        // Solve
        const result = state.solveConstraints();
        if (result?.success) {
            toast.success(`Applied ${meta.label} constraint`);
        } else {
            toast.error(`Constraint failed: ${result?.error || 'solver did not converge'}`);
            solverInstance.removeConstraint(cid);
            set(s => ({
                sketchConstraints: s.sketchConstraints.filter(c => c.id !== cid),
            }));
        }
    },

    // ─── Constraint-first workflow ───────────────────────────────
    startConstraintMode: (type) => {
        const meta = CONSTRAINT_META[type];
        if (!meta) {
            toast.error(`Unknown constraint: ${type}`);
            return;
        }

        const prompt = getNextSelectionPrompt(type, 0);
        set({
            activeConstraintType: type,
            constraintSelectionIds: [],
            constraintSelectionPrompt: prompt || meta.description,
        });

        toast.info(`${meta.label}: ${meta.selectionSteps[0]?.prompt || meta.description}`);
    },

    cancelConstraintMode: () => {
        set({
            activeConstraintType: null,
            constraintSelectionIds: [],
            constraintSelectionPrompt: null,
        });
    },

    addEntityToConstraintSelection: (entityId) => {
        const state = get();
        const { activeConstraintType, constraintSelectionIds, sketchEntities, solverInstance } = state;

        if (!activeConstraintType || !solverInstance?.isInitialized) return false;

        const meta = CONSTRAINT_META[activeConstraintType];
        if (!meta) return false;

        const entity = sketchEntities.get(entityId);
        if (!entity) return false;

        // Don't add duplicates
        if (constraintSelectionIds.includes(entityId)) return false;

        const newIds = [...constraintSelectionIds, entityId];

        // Check if this entity is acceptable at the current step index
        const stepIndex = constraintSelectionIds.length;
        const step = meta.selectionSteps[stepIndex];
        if (step && !step.allowedTypes.includes(entity.type)) {
            toast.error(`Expected ${step.allowedTypes.join(' or ')}, got ${entity.type}`);
            return false;
        }

        // Validate the full selection
        const entityTypes = newIds.map(id => ({
            id,
            type: sketchEntities.get(id)!.type,
        }));
        const validation = validateConstraintSelection(activeConstraintType, entityTypes);

        if (validation.valid && newIds.length >= meta.minEntities) {
            // Valid and complete — apply the constraint
            const orderedIds = reorderEntityIds(activeConstraintType, newIds, sketchEntities);
            const value = computeDefaultValue(activeConstraintType, orderedIds, solverInstance, sketchEntities);

            const cid = solverInstance.addConstraint(activeConstraintType, orderedIds, value);
            if (cid) {
                set(s => ({
                    sketchConstraints: [...s.sketchConstraints, {
                        id: cid,
                        type: activeConstraintType,
                        entityIds: orderedIds,
                        value,
                        driving: true,
                    }],
                    activeConstraintType: null,
                    constraintSelectionIds: [],
                    constraintSelectionPrompt: null,
                }));

                const result = state.solveConstraints();
                if (result?.success) {
                    toast.success(`Applied ${meta.label} constraint`);
                } else {
                    toast.error(`Constraint failed: ${result?.error || 'solver did not converge'}`);
                    solverInstance.removeConstraint(cid);
                    set(s => ({
                        sketchConstraints: s.sketchConstraints.filter(c => c.id !== cid),
                    }));
                }
                return true;
            }
        } else {
            // Not complete yet — update prompt
            const nextPrompt = getNextSelectionPrompt(activeConstraintType, newIds.length);
            set({
                constraintSelectionIds: newIds,
                constraintSelectionPrompt: nextPrompt || meta.description,
            });
            if (nextPrompt) {
                toast.info(`${meta.label}: ${nextPrompt}`);
            }
        }

        return false;
    },

    // ─── Auto-coincident ─────────────────────────────────────────
    autoApplyCoincident: (pointId, threshold = 0.5) => {
        const state = get();
        const { solverInstance, sketchEntities } = state;
        if (!solverInstance?.isInitialized) return;

        const point = sketchEntities.get(pointId);
        if (!point || point.type !== 'point') return;

        // Find nearest other point within threshold
        let nearestId: EntityId | null = null;
        let nearestDist = threshold;

        for (const [otherId, otherEntity] of sketchEntities) {
            if (otherId === pointId) continue;
            if (otherEntity.type !== 'point') continue;

            const dx = point.x - otherEntity.x;
            const dy = point.y - otherEntity.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < nearestDist) {
                nearestDist = dist;
                nearestId = otherId;
            }
        }

        if (nearestId) {
            // Check if coincident already exists
            const exists = state.sketchConstraints.some(c =>
                c.type === 'coincident' &&
                c.entityIds.includes(pointId) &&
                c.entityIds.includes(nearestId!)
            );

            if (!exists) {
                const cid = solverInstance.addConstraint('coincident', [pointId, nearestId]);
                if (cid) {
                    set(s => ({
                        sketchConstraints: [...s.sketchConstraints, {
                            id: cid,
                            type: 'coincident' as ConstraintType,
                            entityIds: [pointId, nearestId!],
                            driving: true,
                        }],
                    }));

                    const result = state.solveConstraints();
                    if (result?.success) {
                        toast.success('Auto-applied coincident constraint', { duration: 1500 });
                    }
                }
            }
        }
    },

    addSolverLineMacro: (p1, p2) => {
        return null;
    },
    addSolverRectangleMacro: (p1, p2) => {
        return null;
    },
    addSolverCircleMacro: (p1, p2) => {
        return null;
    },
});

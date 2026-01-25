import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { ConstraintSolver, EntityId, SketchEntity, ConstraintType } from '../../lib/solver';
import { CADState, SolverSlice } from '../types';

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
            const entities = new Map<EntityId, SketchEntity>();
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
            draggingEntityId: null
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

    applyConstraintToSelection: (type) => {
        const state = get();
        const { solverInstance, sketchEntities, selectedIds } = state;

        if (!solverInstance?.isInitialized) {
            toast.error("Solver not initialized");
            return;
        }

        if (selectedIds.size === 0) {
            toast.error("No entities selected");
            return;
        }

        const ids = Array.from(selectedIds).filter(id => sketchEntities.has(id));
        const entities = ids.map(id => sketchEntities.get(id)!);

        let valid = false;
        let errorMsg = "Invalid selection for this constraint";

        switch (type) {
            case 'horizontal':
            case 'vertical':
                if (ids.length === 1 && entities[0].type === 'line') valid = true;
                else if (ids.length === 2 && entities.every(e => e.type === 'point')) valid = true;
                else errorMsg = "Select 1 Line or 2 Points";
                break;

            case 'coincident':
                if (ids.length === 2 && entities.every(e => e.type === 'point')) valid = true;
                else errorMsg = "Select 2 Points";
                break;

            case 'parallel':
            case 'perpendicular':
            case 'equal':
            case 'angle':
                if (ids.length === 2 && entities.every(e => e.type === 'line')) valid = true;
                else errorMsg = "Select 2 Lines";
                break;

            case 'tangent':
                if (ids.length === 2) {
                    const hasLine = entities.some(e => e.type === 'line');
                    const hasCircle = entities.some(e => ['circle', 'arc'].includes(e.type));
                    const allCircles = entities.every(e => ['circle', 'arc'].includes(e.type));

                    if ((hasLine && hasCircle) || allCircles) valid = true;
                    else errorMsg = "Select 1 Line + 1 Circle/Arc OR 2 Circles/Arcs";
                }
                break;

            case 'midpoint':
            case 'pointOnLine':
                if (ids.length === 2) {
                    const hasLine = entities.some(e => e.type === 'line');
                    const hasPoint = entities.some(e => e.type === 'point');
                    if (hasLine && hasPoint) valid = true;
                    else errorMsg = "Select 1 Point and 1 Line";
                }
                break;

            case 'pointOnCircle':
                if (ids.length === 2) {
                    const hasCircle = entities.some(e => ['circle', 'arc'].includes(e.type));
                    const hasPoint = entities.some(e => e.type === 'point');
                    if (hasCircle && hasPoint) valid = true;
                    else errorMsg = "Select 1 Point and 1 Circle/Arc";
                }
                break;

            case 'distance':
                if (ids.length === 2 && entities.every(e => e.type === 'point')) valid = true;
                else errorMsg = "Select 2 Points (for distance)";
                break;

            default:
                valid = true;
        }

        if (!valid) {
            toast.error(errorMsg);
            return;
        }

        let value: number | undefined = undefined;

        if (type === 'distance') {
            if (entities[0].type === 'point' && entities[1].type === 'point') {
                const p1 = entities[0] as any;
                const p2 = entities[1] as any;
                value = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            }
        }

        const cid = solverInstance.addConstraint(type, ids, value);
        if (cid) {
            set(state => ({
                sketchConstraints: [...state.sketchConstraints, {
                    id: cid, type, entityIds: ids, value, driving: true
                }]
            }));

            const result = state.solveConstraints();
            if (result?.success) {
                toast.success(`Applied ${type} constraint`);
            } else {
                toast.error("Constraint invalid or redundant");
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

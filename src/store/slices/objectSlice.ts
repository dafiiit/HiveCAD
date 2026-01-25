import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { initCAD, replicadToThreeGeometry, replicadToThreeEdges } from '../../lib/cad-kernel';
import * as replicad from 'replicad';
import { CodeManager } from '../../lib/code-manager';
import { toolRegistry } from '../../lib/tools';
import { CADState, ObjectSlice, CADObject } from '../types';

const DEFAULT_CODE = `const main = () => {
  return;
};`;

const DEFAULT_COLORS = ['#6090c0', '#c06060', '#60c060', '#c0c060', '#c0c060', '#60c0c0'];
let colorIndex = 0;
const getNextColor = () => {
    const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
    colorIndex++;
    return color;
};

export const createObjectSlice: StateCreator<
    CADState,
    [],
    [],
    ObjectSlice
> = (set, get) => ({
    objects: [],
    selectedIds: new Set(),
    activeTool: 'select',
    activeTab: 'SOLID',
    code: DEFAULT_CODE,
    activeOperation: null,

    addObject: async (type, options = {}) => {
        try {
            await initCAD();
        } catch (e) {
            console.error("Failed to initialize CAD kernel:", e);
            return;
        }

        const currentState = get();
        const cm = new CodeManager(currentState.code);

        // Get tool from registry
        const tool = toolRegistry.get(type);

        if (tool) {
            // Get params with defaults from registry merged with provided options
            const params = { ...toolRegistry.getDefaultParams(type), ...options.dimensions };

            if (tool.create) {
                // Primitive tools that create new geometry
                tool.create(cm, params);
            } else if (tool.execute) {
                // Operation tools that modify selected objects
                const selectedIds = [...currentState.selectedIds];

                // Validate selection requirements
                if (tool.selectionRequirements) {
                    const reqs = tool.selectionRequirements;
                    const count = selectedIds.length;

                    if (reqs.min !== undefined && count < reqs.min) {
                        toast.error(`${tool.metadata.label} requires at least ${reqs.min} selection${reqs.min > 1 ? 's' : ''}`);
                        return;
                    }
                    if (reqs.max !== undefined && count > reqs.max) {
                        toast.error(`${tool.metadata.label} supports at most ${reqs.max} selection${reqs.max > 1 ? 's' : ''}`);
                        return;
                    }

                    if (reqs.allowedTypes) {
                        const invalidSelection = selectedIds.some(id => {
                            const obj = currentState.objects.find(o => o.id === id);
                            if (!obj) return true; // Should not happen

                            const isSolid = ['box', 'cylinder', 'sphere', 'torus', 'coil', 'extrusion', 'revolve'].includes(obj.type);
                            const isSketch = obj.type === 'sketch' || toolRegistry.get(obj.type)?.metadata.category === 'sketch';

                            if (reqs.allowedTypes?.includes('solid') && isSolid) return false;
                            if (reqs.allowedTypes?.includes('sketch') && isSketch) return false;

                            return true; // Invalid
                        });

                        if (invalidSelection) {
                            toast.error(`${tool.metadata.label} requires specific selection types: ${reqs.allowedTypes.join(', ')}`);
                            return;
                        }
                    }
                }

                // Fallback check if no requirements defined but tool is "operation"
                if (!tool.selectionRequirements && selectedIds.length === 0 && ['extrusion', 'revolve', 'pivot', 'translatePlane'].includes(type)) {
                    toast.error(`No object selected for ${type}`);
                    return;
                }

                tool.execute(cm, selectedIds, params);
            }
        } else {
            // Legacy fallback for types not yet in registry
            console.warn(`Tool "${type}" not found in registry, using legacy implementation`);

            if (type === 'extrusion') {
                const selectedId = [...currentState.selectedIds][0];
                if (selectedId) {
                    const { distance } = options.dimensions || { distance: 10 };
                    cm.addOperation(selectedId, 'extrude', [distance]);
                } else {
                    toast.error("No sketch selected for extrusion");
                    return;
                }
            } else if (type === 'revolve') {
                const selectedId = [...currentState.selectedIds][0];
                if (selectedId) {
                    cm.addOperation(selectedId, 'revolve', []);
                } else {
                    toast.error("No sketch selected for revolve");
                    return;
                }
            }
        }

        set({ code: cm.getCode() });
        get().runCode();
    },

    updateObject: (id, updates) => {
        const state = get();
        // Code First Update
        if (updates.dimensions) {
            const cm = new CodeManager(state.code);
            const obj = state.objects.find(o => o.id === id);
            if (!obj) return;

            const opIndex = 0;

            if (obj.type === 'box') {
                const d = obj.dimensions;
                const newDims = { ...d, ...updates.dimensions };
                cm.updateOperation(id, opIndex, [newDims.width, newDims.height, newDims.depth]);
            } else if (obj.type === 'cylinder') {
                const d = obj.dimensions;
                const newDims = { ...d, ...updates.dimensions };
                cm.updateOperation(id, opIndex, [newDims.radius, newDims.height]);
            } else if (obj.type === 'sphere') {
                const d = obj.dimensions;
                const newDims = { ...d, ...updates.dimensions };
                cm.updateOperation(id, opIndex, [newDims.radius]);
            }

            set({ code: cm.getCode() });
            get().runCode();
            return;
        }

        // Fallback for non-code updates (e.g. name, color)
        const objectIndex = state.objects.findIndex(o => o.id === id);
        if (objectIndex === -1) return;

        const updatedObjects = [...state.objects];
        updatedObjects[objectIndex] = { ...updatedObjects[objectIndex], ...updates };
        set({ objects: updatedObjects, isSaved: false });
    },

    deleteObject: (id) => {
        const state = get();
        // Code First Deletion
        const cm = new CodeManager(state.code);
        cm.removeFeature(id);
        const newCode = cm.getCode();

        if (newCode !== state.code) {
            set({ code: newCode });
            get().runCode();
        } else {
            console.warn("Delete via Code First failed - deleting from view only");
            set({
                objects: state.objects.filter(o => o.id !== id),
                selectedIds: new Set([...state.selectedIds].filter(sid => sid !== id)),
                isSaved: false,
            });
        }
    },

    selectObject: (id, multiSelect = false) => {
        const state = get();
        const newSelected = new Set(multiSelect ? state.selectedIds : []);

        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }

        const updatedObjects = state.objects.map(obj => ({
            ...obj,
            selected: newSelected.has(obj.id),
        }));

        set({ objects: updatedObjects, selectedIds: newSelected });
    },

    clearSelection: () => {
        const state = get();
        const updatedObjects = state.objects.map(obj => ({ ...obj, selected: false }));
        set({ objects: updatedObjects, selectedIds: new Set() });
    },

    duplicateSelected: () => {
        console.log("Duplicate not implemented in Code First yet");
    },

    setActiveTool: (tool) => set({ activeTool: tool }),
    setActiveTab: (tab) => set({ activeTab: tab }),

    setCode: (code) => set({ code }),

    runCode: async () => {
        const state = get();
        try {
            await initCAD();

            // 1. Transform Code
            const cm = new CodeManager(state.code);
            const executableCode = cm.transformForExecution();

            // 2. Define Instrumentation
            const __record = (uuid: string, shape: any) => {
                if (shape && typeof shape === 'object') {
                    try {
                        (shape as any)._astId = uuid;
                    } catch (e) {
                        console.warn("Could not attach ID to shape", e);
                    }
                }
                return shape;
            };

            // 3. Execute
            const hasDefaultParams = /const\s+defaultParams\s*=/.test(state.code);
            const mainCall = hasDefaultParams
                ? "\nreturn main(replicad, defaultParams);"
                : "\nreturn main();";
            const evaluator = new Function('replicad', '__record', executableCode + mainCall);
            const result = evaluator(replicad, __record);

            let shapesArray: any[] = [];
            if (Array.isArray(result)) {
                shapesArray = result.flat(Infinity);
            } else if (result) {
                shapesArray = [result];
            }

            // 4. Map to CADObjects
            const newObjects: CADObject[] = shapesArray.map((item, index) => {
                const shape = item.shape || item;
                const astId = (shape as any)._astId || `gen-${index}`;
                const existing = state.objects.find(o => o.id === astId);

                let geometry = null;
                let edgeGeometry = null;
                try {
                    geometry = replicadToThreeGeometry(shape);
                    edgeGeometry = replicadToThreeEdges(shape);
                } catch (err) {
                    console.error(`Failed to convert shape ${index}`, err);
                }

                let type: CADObject['type'] = existing?.type || 'box';
                const feature = cm.getFeatures().find(f => f.id === astId);

                if (feature && feature.operations.length > 0) {
                    const lastOp = feature.operations[feature.operations.length - 1];
                    const lastOpName = lastOp.name.toLowerCase();

                    if (lastOpName.includes('box')) type = 'box';
                    else if (lastOpName.includes('cylinder')) type = 'cylinder';
                    else if (lastOpName.includes('sphere')) type = 'sphere';
                    else if (lastOpName.includes('torus')) type = 'torus';
                    else if (lastOpName.includes('extrude')) type = 'extrusion';
                    else if (lastOpName.includes('revolve')) type = 'revolve';
                    else if (lastOpName.includes('draw') || lastOpName.includes('sketch')) type = 'sketch';
                    else if (lastOpName.includes('plane')) type = 'plane';

                }

                const dimensions = { ...(existing?.dimensions || {}) };
                const featurePlaneOp = feature?.operations.find(op => op.name === 'sketchOnPlane');
                if (featurePlaneOp && featurePlaneOp.args.length > 0 && featurePlaneOp.args[0].type === 'StringLiteral') {
                    dimensions.sketchPlane = featurePlaneOp.args[0].value;
                }

                return {
                    id: astId,
                    name: existing?.name || (type === 'extrusion' ? 'Extrusion' : type.charAt(0).toUpperCase() + type.slice(1)) + ' ' + (index + 1),
                    type: type as CADObject['type'],
                    position: [0, 0, 0] as [number, number, number],
                    rotation: [0, 0, 0] as [number, number, number],
                    scale: [1, 1, 1] as [number, number, number],
                    dimensions: dimensions,
                    color: existing?.color || getNextColor(),
                    visible: true,
                    selected: existing?.selected || false,
                    geometry: geometry || undefined,
                    edgeGeometry: edgeGeometry || undefined
                };
            }).filter(obj => (obj.geometry !== undefined || obj.edgeGeometry !== undefined));

            set({ objects: newObjects });

        } catch (e: any) {
            console.error("Error executing code:", e);
            toast.error(`Error: ${e.message}`);
        }
    },

    executeOperation: (type) => {
        const state = get();
        const selectedIds = [...state.selectedIds];

        if (selectedIds.length < 2) {
            toast.error("Select at least 2 objects for this operation");
            return;
        }

        const cm = new CodeManager(state.code);
        const primaryId = selectedIds[0];
        const secondaryIds = selectedIds.slice(1);

        const methodMap = {
            join: 'fuse',
            cut: 'cut',
            intersect: 'intersect'
        };

        const methodName = methodMap[type];

        secondaryIds.forEach(id => {
            cm.addOperation(primaryId, methodName, [{ type: 'raw', content: id }]);
        });

        secondaryIds.forEach(id => {
            cm.removeFeature(id);
        });

        set({ code: cm.getCode() });
        get().runCode();
        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} operation applied`);
    },

    startOperation: (type) => {
        const getDefaultDimensions = (t: string) => {
            const registryDefaults = toolRegistry.getDefaultParams(t);
            if (Object.keys(registryDefaults).length > 0) return registryDefaults;
            switch (t) {
                case 'extrusion': return { distance: 10, twistAngle: 0, endFactor: 1, profile: 'linear' };
                case 'revolve': return { angle: 360 };
                case 'pivot': return { angle: 45, axis: [0, 0, 1] };
                case 'translatePlane': return { x: 0, y: 0, z: 0 };
                default: return {};
            }
        };
        const params = getDefaultDimensions(type);
        set({ activeOperation: { type, params } });
    },

    updateOperationParams: (params) => {
        set(state => ({
            activeOperation: state.activeOperation
                ? { ...state.activeOperation, params: { ...state.activeOperation.params, ...params } }
                : null
        }));
    },

    cancelOperation: () => set({ activeOperation: null }),

    applyOperation: () => {
        const state = get();
        if (!state.activeOperation) return;
        const { type, params } = state.activeOperation;

        if ((type === 'extrusion' || type === 'extrude' || type === 'revolve') && params?.selectedShape) {
            const newSelectedIds = new Set([params.selectedShape]);
            set({ selectedIds: newSelectedIds });
        }

        state.addObject(type, { dimensions: params });
        set({ activeOperation: null });
    },
});

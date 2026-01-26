import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { initCAD, replicadToThreeGeometry, replicadToThreeEdges } from '../../lib/cad-kernel';
// import * as replicad from 'replicad'; // Removed: execution is now in worker
import { CodeManager } from '../../lib/code-manager';
import { toolRegistry } from '../../lib/tools';
import { CADState, ObjectSlice, CADObject } from '../types';
import * as THREE from 'three';

const DEFAULT_CODE = `const main = () => {
  return;
};`;

// Worker Initialization
let replicadWorker: Worker | null = null;
const getWorker = () => {
    if (!replicadWorker) {
        replicadWorker = new Worker(new URL('../../workers/replicad-worker.ts', import.meta.url), {
            type: 'module'
        });
    }
    return replicadWorker;
};

const DEFAULT_COLORS = ['#6090c0', '#c06060', '#60c060', '#c0c060', '#c0c060', '#60c0c0'];
let colorIndex = 0;
const getNextColor = () => {
    const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
    colorIndex++;
    return color;
};

const getOriginAxes = (): CADObject[] => {
    const axisLength = 100;
    const axes: CADObject[] = [
        {
            id: 'AXIS_X',
            name: 'X Axis',
            type: 'datumAxis',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            dimensions: {},
            color: '#ff4444',
            visible: true,
            selected: false,
        },
        {
            id: 'AXIS_Y',
            name: 'Y Axis',
            type: 'datumAxis',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            dimensions: {},
            color: '#44ff44',
            visible: true,
            selected: false
        },
        {
            id: 'AXIS_Z',
            name: 'Z Axis',
            type: 'datumAxis',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            dimensions: {},
            color: '#4444ff',
            visible: true,
            selected: false
        }
    ];

    // Create geometries
    const createAxisGeo = (start: [number, number, number], end: [number, number, number]) => {
        const geo = new THREE.BufferGeometry();
        const vertices = new Float32Array([...start, ...end]);
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        return geo;
    };

    // Helper for thicker hit target if needed (optional)
    const createHitCylinder = (length: number, axis: 'x' | 'y' | 'z') => {
        const geo = new THREE.CylinderGeometry(2, 2, length * 2);
        if (axis === 'x') { geo.rotateZ(-Math.PI / 2); }
        if (axis === 'y') { /* default Y up */ }
        if (axis === 'z') { geo.rotateX(Math.PI / 2); }
        return geo;
    };

    // Use edgeGeometry for the visual "line"
    // Use regular geometry (invisible) for hit testing? 
    // Actually, Viewport renderer only attaches events to `geometry` mesh.
    // So we need a mesh. If we make it fully transparent, it works as a hit target.
    // And we set edgeGeometry for the visual line.

    // X Axis - Red
    axes[0].geometry = createHitCylinder(axisLength, 'x');
    axes[0].edgeGeometry = createAxisGeo([-axisLength, 0, 0], [axisLength, 0, 0]);

    // Y Axis - Green
    axes[1].geometry = createHitCylinder(axisLength, 'y');
    axes[1].edgeGeometry = createAxisGeo([0, -axisLength, 0], [0, axisLength, 0]);

    // Z Axis - Blue
    axes[2].geometry = createHitCylinder(axisLength, 'z');
    axes[2].edgeGeometry = createAxisGeo([0, 0, -axisLength], [0, 0, axisLength]);

    return axes;
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
        // initCAD is still useful for initial setup check or helper functions on main thread if any
        // but for worker execution it's handled inside the worker.
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

                            // Check strictly if the type is allowed
                            if (reqs.allowedTypes?.includes(obj.type as any)) return false;

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
        get().triggerSave();
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
            get().triggerSave();
            return;
        }

        // Fallback for non-code updates (e.g. name, color)
        const objectIndex = state.objects.findIndex(o => o.id === id);
        if (objectIndex === -1) return;

        const updatedObjects = [...state.objects];
        updatedObjects[objectIndex] = { ...updatedObjects[objectIndex], ...updates };
        set({ objects: updatedObjects, isSaved: false });
        get().triggerSave();
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
            get().triggerSave();
        } else {
            console.warn("Delete via Code First failed - deleting from view only");
            set({
                objects: state.objects.filter(o => o.id !== id),
                selectedIds: new Set([...state.selectedIds].filter(sid => sid !== id)),
                isSaved: false,
            });
            get().triggerSave();
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
    setCode: (code) => {
        set({ code, isSaved: false });
        get().triggerSave();
    },

    runCode: async () => {
        const state = get();
        try {
            const cm = new CodeManager(state.code);
            const executableCode = cm.transformForExecution();

            const worker = getWorker();

            // Promise wrapper for worker message
            const executeInWorker = () => {
                return new Promise<any>((resolve, reject) => {
                    const handler = (e: MessageEvent) => {
                        if (e.data.type === 'SUCCESS') {
                            worker.removeEventListener('message', handler);
                            resolve(e.data.meshes);
                        } else if (e.data.type === 'ERROR') {
                            worker.removeEventListener('message', handler);
                            reject(new Error(e.data.error));
                        }
                    };
                    worker.addEventListener('message', handler);
                    worker.postMessage({ type: 'EXECUTE', code: executableCode });
                });
            };

            const shapesArray = await executeInWorker();

            // 4. Map to CADObjects
            const newObjects: CADObject[] = shapesArray.map((item: any, index: number) => {
                const astId = item.id;
                const existing = state.objects.find(o => o.id === astId);

                let geometry = undefined;
                let edgeGeometry = undefined;

                // Reconstruct Geometry from Worker Data
                if (item.meshData) {
                    const { vertices, indices, normals } = item.meshData;
                    geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
                    if (indices) geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
                    if (normals && normals.length > 0) {
                        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
                    } else {
                        geometry.computeVertexNormals();
                    }
                }

                if (item.edgeData && item.edgeData.length > 0) {
                    edgeGeometry = new THREE.BufferGeometry();
                    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(item.edgeData), 3));
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
                    geometry: geometry,
                    edgeGeometry: edgeGeometry,
                    faceMapping: item.faceMapping,
                    edgeMapping: item.edgeMapping
                };
            }).filter((obj: any) => (obj.geometry !== undefined || obj.edgeGeometry !== undefined));

            // Add origin axes
            newObjects.push(...getOriginAxes());

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
        get().triggerSave();
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

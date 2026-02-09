import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { initCAD, replicadToThreeGeometry, replicadToThreeEdges } from '../../lib/cad-kernel';
// import * as replicad from 'replicad'; // Removed: execution is now in worker
import { CodeManager } from '../../lib/code-manager';
import { getDependencyGraph, mergeExecutionResults } from '../../lib/dependency-graph';
import { toolRegistry } from '../../lib/tools';
import { CADState, ObjectSlice, CADObject } from '../types';
import * as THREE from 'three';

const DEFAULT_CODE = `const main = () => {
  return;
};`;

import { replicadWorkerPool } from '../../lib/workers/WorkerPool';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const WARN_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const DEFAULT_COLORS = ['#6090c0', '#c06060', '#60c060', '#c06060', '#c0c060', '#60c0c0'];
let colorIndex = 0;
const getNextColor = () => {
    const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
    colorIndex++;
    return color;
};

// Track geometries for cleanup
const geometryRegistry = new WeakMap<CADObject, THREE.BufferGeometry[]>();

const registerGeometries = (obj: CADObject) => {
    const geometries = [obj.geometry, obj.edgeGeometry, obj.vertexGeometry].filter((g): g is THREE.BufferGeometry => !!g);
    if (geometries.length > 0) {
        geometryRegistry.set(obj, geometries);
    }
};

const disposeGeometries = (obj: CADObject) => {
    if (geometryRegistry.has(obj)) {
        const geometries = geometryRegistry.get(obj)!;
        geometries.forEach(geo => geo.dispose());
        geometryRegistry.delete(obj);
    }
};

let cachedAxes: CADObject[] | null = null;
const getOriginAxes = (): CADObject[] => {
    if (cachedAxes) return cachedAxes;

    const axisLength = 50;
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

    // Helper for thicker hit target
    const createHitCylinder = (length: number, axis: 'x' | 'y' | 'z') => {
        const geo = new THREE.CylinderGeometry(2, 2, length);
        if (axis === 'x') {
            geo.rotateZ(-Math.PI / 2);
            geo.translate(length / 2, 0, 0);
        }
        if (axis === 'y') {
            /* default Y up */
            geo.translate(0, length / 2, 0);
        }
        if (axis === 'z') {
            geo.rotateX(Math.PI / 2);
            geo.translate(0, 0, length / 2);
        }
        return geo;
    };

    // Use edgeGeometry for the visual "line"
    // Use regular geometry (invisible) for hit testing? 
    // Actually, Viewport renderer only attaches events to `geometry` mesh.
    // So we need a mesh. If we make it fully transparent, it works as a hit target.
    // And we set edgeGeometry for the visual line.

    // X Axis - Red
    axes[0].geometry = createHitCylinder(axisLength, 'x');
    axes[0].geometry.computeBoundingSphere();
    axes[0].edgeGeometry = createAxisGeo([0, 0, 0], [axisLength, 0, 0]);
    axes[0].edgeGeometry.computeBoundingSphere();

    // Y Axis - Green
    axes[1].geometry = createHitCylinder(axisLength, 'y');
    axes[1].geometry.computeBoundingSphere();
    axes[1].edgeGeometry = createAxisGeo([0, 0, 0], [0, axisLength, 0]);
    axes[1].edgeGeometry.computeBoundingSphere();

    // Z Axis - Blue
    axes[2].geometry = createHitCylinder(axisLength, 'z');
    axes[2].geometry.computeBoundingSphere();
    axes[2].edgeGeometry = createAxisGeo([0, 0, 0], [0, 0, axisLength]);
    axes[2].edgeGeometry.computeBoundingSphere();

    cachedAxes = axes;
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
    pendingImport: null,
    meshingProgress: null,

    addObject: async (type: CADObject['type'] | string, options: Partial<CADObject> = {}) => {
        try {
            await initCAD();
        } catch (e) {
            console.error("Failed to initialize CAD kernel:", e);
            return;
        }

        const currentState = get();
        const cm = new CodeManager(currentState.code);
        const tool = toolRegistry.get(type);

        if (tool) {
            const params = { ...toolRegistry.getDefaultParams(type), ...options.dimensions };
            if (tool.create) {
                tool.create(cm, params);
            } else if (tool.execute) {
                const selectedIds = [...currentState.selectedIds];
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
                            // Handle face/edge/vertex selections like "shape1:face-0"
                            const baseId = id.split(':')[0];
                            const isFaceSelection = id.includes(':face-');
                            const isEdgeSelection = id.includes(':edge-');
                            const isVertexSelection = id.includes(':vertex-');

                            const obj = currentState.objects.find(o => o.id === baseId);
                            if (!obj) return true;

                            // Check if the selection type itself is allowed
                            if (isFaceSelection && reqs.allowedTypes?.includes('face')) return false;
                            if (isEdgeSelection && reqs.allowedTypes?.includes('edge')) return false;
                            if (isVertexSelection && reqs.allowedTypes?.includes('vertex')) return false;

                            // Check the object's type
                            if (reqs.allowedTypes?.includes(obj.type as any)) return false;
                            const isSolid = ['box', 'cylinder', 'sphere', 'torus', 'coil', 'extrusion', 'revolve'].includes(obj.type);
                            const isSketch = obj.type === 'sketch' || toolRegistry.get(obj.type)?.metadata.category === 'sketch';
                            if (reqs.allowedTypes?.includes('solid') && isSolid) return false;
                            if (reqs.allowedTypes?.includes('sketch') && isSketch) return false;
                            return true;
                        });
                        if (invalidSelection) {
                            toast.error(`${tool.metadata.label} requires specific selection types: ${reqs.allowedTypes.join(', ')}`);
                            return;
                        }
                    }
                }
                if (!tool.selectionRequirements && selectedIds.length === 0 && ['extrusion', 'revolve', 'pivot', 'translatePlane'].includes(type)) {
                    toast.error(`No object selected for ${type}`);
                    return;
                }
                tool.execute(cm, selectedIds, params);
            }
        } else {
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
        await get().runCode();
        get().pushToHistory('create', `Add ${type}`);
        get().triggerSave();
    },

    updateObject: async (id, updates) => {
        const state = get();
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
            await get().runCode();
            get().pushToHistory('modify', `Update ${id}`);
            get().triggerSave();
            return;
        }
        const objectIndex = state.objects.findIndex(o => o.id === id);
        if (objectIndex === -1) return;

        const oldObject = state.objects[objectIndex];

        // If geometries are changing, dispose old ones
        if (updates.geometry || updates.edgeGeometry || updates.vertexGeometry) {
            disposeGeometries(oldObject);
        }

        const updatedObjects = [...state.objects];
        updatedObjects[objectIndex] = { ...oldObject, ...updates };

        // Update registry with the new object reference
        // (WeakMap needs the exact object reference being stored in state)
        if (updates.geometry || updates.edgeGeometry || updates.vertexGeometry) {
            registerGeometries(updatedObjects[objectIndex]);
        } else if (geometryRegistry.has(oldObject)) {
            // Keep existing geometries for the new object reference
            const geometries = geometryRegistry.get(oldObject)!;
            geometryRegistry.set(updatedObjects[objectIndex], geometries);
            geometryRegistry.delete(oldObject);
        }

        set({ objects: updatedObjects, isSaved: false });
        get().triggerSave();
    },

    deleteObject: async (id) => {
        const state = get();

        // Dispose geometries if the object exists
        const objectToDelete = state.objects.find(o => o.id === id);
        if (objectToDelete) {
            // Don't dispose system axes
            if (!objectToDelete.id.startsWith('AXIS_')) {
                disposeGeometries(objectToDelete);
            }
        }

        const cm = new CodeManager(state.code);
        cm.removeFeature(id);
        const newCode = cm.getCode();
        if (newCode !== state.code) {
            set({ code: newCode });
            await get().runCode();
            get().pushToHistory('delete', `Delete ${id}`);
            get().triggerSave();
        } else {
            console.warn("Delete via Code First failed - deleting from view only");
            set({
                objects: state.objects.filter(o => o.id !== id),
                selectedIds: new Set([...state.selectedIds].filter(sid => sid !== id)),
                isSaved: false,
            });
            get().pushToHistory('delete', `Delete ${id} (view only)`);
            get().triggerSave();
        }
    },

    clearAllObjects: () => {
        const state = get();
        state.objects.forEach(obj => {
            if (!obj.id.startsWith('AXIS_')) {
                disposeGeometries(obj);
            }
        });
        set({ objects: [], selectedIds: new Set() });
    },

    selectObject: (id, multiSelect = false) => {
        const state = get();
        let newSelected: Set<string>;

        if (multiSelect) {
            newSelected = new Set(state.selectedIds);
            if (newSelected.has(id)) {
                newSelected.delete(id);
            } else {
                newSelected.add(id);
            }
        } else {
            // Single select mode: toggle if already selected alone, or select this one only
            if (state.selectedIds.has(id) && state.selectedIds.size === 1) {
                newSelected = new Set();
            } else {
                newSelected = new Set([id]);
            }
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

    // todo:everything Implement duplicate selection in Code First.
    duplicateSelected: () => {
        console.log("Duplicate not implemented in Code First yet");
    },

    setActiveTool: (tool) => set((state) => ({
        activeTool: state.activeTool === tool ? 'select' : tool
    })),
    setActiveTab: (tab) => set({ activeTab: tab }),
    setCode: (code) => {
        set({ code, isSaved: false });
        // We don't push to history on every character, 
        // usually history is pushed after runCode (manual or auto-run)
        get().triggerSave();
    },

    runCode: async () => {
        const state = get();
        try {
            const cm = new CodeManager(state.code);
            const executableCode = cm.transformForExecution();

            // DAG-based incremental execution
            const depGraph = getDependencyGraph();
            const analysis = depGraph.analyze(state.code);
            const plan = depGraph.createExecutionPlan(state.code, analysis);

            // Get cached results for unchanged features
            const cachedResults = depGraph.getCached(plan.toCache);

            // Log incremental execution stats
            if (plan.toCache.length > 0) {
                console.log(`[Incremental] Executing ${plan.toExecute.length} features, reusing ${plan.toCache.length} from cache`);
            }

            const result = await replicadWorkerPool.execute(
                { type: 'EXECUTE', code: executableCode },
                (progressData) => {
                    if (progressData.type === 'MESH_PROGRESS') {
                        set({
                            meshingProgress: {
                                id: progressData.id,
                                stage: progressData.stage,
                                progress: progressData.progress
                            }
                        });
                    }
                }
            );
            set({ meshingProgress: null });

            // Merge new results with cached results
            const executedResults = result.meshes;
            const mergedResults = mergeExecutionResults(
                cachedResults,
                executedResults,
                analysis.executionOrder
            );

            // Update cache with newly executed results
            depGraph.updateCache(executedResults);

            const shapesArray = mergedResults;
            // Record if this was a significant change (already handled by pushToHistory)
            const newObjects: CADObject[] = shapesArray.map((item: { id: string; meshData?: any; edgeData?: any; vertexData?: any; faceMapping?: any; edgeMapping?: any; fromCache?: boolean }, index: number) => {
                const astId = item.id;
                const existing = state.objects.find(o => o.id === astId);
                let geometry = undefined;
                let edgeGeometry = undefined;
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
                    geometry.computeBoundingSphere();
                }
                if (item.edgeData && item.edgeData.length > 0) {
                    edgeGeometry = new THREE.BufferGeometry();
                    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(item.edgeData), 3));
                    edgeGeometry.computeBoundingSphere();
                }

                let vertexGeometry = undefined;
                if (item.vertexData && item.vertexData.length > 0) {
                    vertexGeometry = new THREE.BufferGeometry();
                    vertexGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(item.vertexData), 3));
                    vertexGeometry.computeBoundingSphere();
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
                    vertexGeometry: vertexGeometry,
                    faceMapping: item.faceMapping,
                    edgeMapping: item.edgeMapping
                };
            }).filter((obj: CADObject) => (obj.geometry !== undefined || obj.edgeGeometry !== undefined || obj.vertexGeometry !== undefined));

            // Register new geometries
            newObjects.forEach(registerGeometries);

            // Dispose old non-system geometries
            state.objects.forEach(obj => {
                if (!obj.id.startsWith('AXIS_')) {
                    disposeGeometries(obj);
                }
            });

            newObjects.push(...getOriginAxes());
            set({ objects: newObjects });
        } catch (e: unknown) {
            console.error("Error executing code:", e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            toast.error(`Error: ${errorMessage}`);
        }
    },

    executeOperation: async (type) => {
        const state = get();
        const selectedIds = [...state.selectedIds];
        if (selectedIds.length < 2) {
            toast.error("Select at least 2 objects for this operation");
            return;
        }
        const cm = new CodeManager(state.code);
        const primaryId = selectedIds[0];
        const secondaryIds = selectedIds.slice(1);
        const methodMap = { join: 'fuse', cut: 'cut', intersect: 'intersect' };
        const methodName = methodMap[type];
        secondaryIds.forEach(id => {
            cm.addOperation(primaryId, methodName, [{ type: 'raw', content: id }]);
        });
        secondaryIds.forEach(id => {
            cm.removeFeature(id);
        });
        set({ code: cm.getCode() });
        await get().runCode();
        get().pushToHistory('modify', `${type} operation`);
        get().triggerSave();
        toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} operation applied`);
    },

    startOperation: (type) => {
        const state = get();
        if (state.activeOperation?.type === type) {
            set({ activeOperation: null });
            return;
        }

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

    exportSTL: async () => {
        const state = get();
        const result = await replicadWorkerPool.execute({ type: 'EXPORT_STL', code: state.code });
        const blob = result.blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.fileName || 'model'}.stl`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("STL Exported", { id: 'export' });
    },

    exportSTEP: async () => {
        const state = get();
        const result = await replicadWorkerPool.execute({ type: 'EXPORT_STEP', code: state.code });
        const blob = result.blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.fileName || 'model'}.step`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("STEP Exported", { id: 'export' });
    },

    exportJSON: () => {
        const state = get();
        const data = { name: state.fileName, code: state.code, version: '1.0' };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.fileName || 'project'}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Project Exported (JSON)");
    },

    confirmImport: async () => {
        const state = get();
        if (!state.pendingImport) return;
        const { file, type, extension } = state.pendingImport;
        set({ pendingImport: null });
        await state.processImport(file, type, extension);
    },

    cancelImport: () => {
        set({ pendingImport: null });
    },

    processImport: async (file: File, type: string, extension: string) => {
        toast.loading(`Importing ${file.name}...`, { id: 'import' });

        try {
            if (extension === 'json') {
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.code) {
                    get().setCode(data.code);
                    await get().runCode();
                    toast.success("Project imported from JSON", { id: 'import' });
                } else {
                    throw new Error("Invalid JSON project file");
                }
            } else if (extension === 'stl' || extension === 'step' || extension === 'stp') {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const base64 = dataUrl.split(',')[1];
                const varName = `imported${type}${Math.floor(Math.random() * 1000)}`;

                const importCode = `
  // Imported ${type} file: ${file.name}
  const ${varName}Raw = "${base64}";
  
  // Robust base64 decoding using atob
  const ${varName}String = atob(${varName}Raw);
  const ${varName}Bytes = new Uint8Array(${varName}String.length);
  for (let i = 0; i < ${varName}String.length; i++) {
    ${varName}Bytes[i] = ${varName}String.charCodeAt(i);
  }
  const ${varName}Blob = new Blob([${varName}Bytes], { type: 'application/octet-stream' });
  
  const ${varName} = await replicad.import${type}(${varName}Blob);
`;
                const currentCode = get().code;
                let newCode = currentCode;

                const mainFunctionPatterns = [
                    'async function main() {',
                    'function main() {',
                    'const main = () => {',
                    'const main = async () => {'
                ];

                let injected = false;
                for (const pattern of mainFunctionPatterns) {
                    if (currentCode.includes(pattern)) {
                        let replacement = pattern;
                        if (!pattern.includes('async')) {
                            if (pattern.includes('function')) {
                                replacement = pattern.replace('function', 'async function');
                            } else if (pattern.includes('=>')) {
                                replacement = pattern.replace('() =>', 'async () =>');
                            }
                        }
                        newCode = currentCode.replace(pattern, `${replacement}${importCode}`);
                        injected = true;
                        break;
                    }
                }

                if (!injected) {
                    newCode = `async function main() {${importCode}\n  return ${varName};\n}`;
                } else {
                    if (newCode.includes('return [];')) {
                        newCode = newCode.replace('return [];', `return ${varName};`);
                    } else if (newCode.includes('return;')) {
                        newCode = newCode.replace('return;', `return ${varName};`);
                    }
                }

                get().setCode(newCode);
                await get().runCode();
                toast.success(`${type} file imported successfully`, { id: 'import' });
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            toast.error(`Import failed: ${errorMessage}`, { id: 'import' });
        }
    },

    importFile: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.stl,.step,.stp';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                toast.error(
                    `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). ` +
                    `Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`
                );
                return;
            }

            const extension = file.name.split('.').pop()?.toLowerCase() || '';
            const type = (extension === 'stl') ? 'STL' : 'STEP';

            if (file.size > WARN_FILE_SIZE) {
                set({ pendingImport: { file, type, extension } });
                return;
            }

            await get().processImport(file, type, extension);
        };
        input.click();
    },
});

import { StateCreator } from 'zustand';
import { toast } from 'sonner';
import { CodeManager } from '../../lib/code-manager';
import { getDependencyGraph, mergeExecutionResults } from '../../lib/dependency-graph';
import { toolRegistry } from '../../lib/tools';
import { invokeToolCreate, invokeToolExecute } from '../../lib/tools/invoke';
import { CADState, ObjectSlice, CADObject } from '../types';
import { getKernelWorker } from '../../lib/workers/KernelWorker';
import {
    registerGeometries,
    disposeGeometries,
    migrateGeometries,
    getOriginAxes,
    getNextColor,
    buildMeshGeometry,
    buildEdgeGeometry,
} from './objectGeometry';
import {
    getImportAccept,
    getImportLabel,
    getImportedFileType,
    matchesImportFormat,
    type ImportFormat,
} from '../../lib/storage/import';
import { selectionNameOf, reconcileFaceSelections } from '../../lib/selection/durableSelection';
import { documentFromFeatures } from '../../lib/document/fromCode';
import { deriveFromToolCode, deriveFromCodeEdit } from '../../lib/document/sync';

const DEFAULT_CODE = `const main = () => {
  return;
};`;

/**
 * The document whose shapes currently populate the worker's shape store and the
 * main-thread mesh cache. Feature ids (`shape1`, `shape2`, …) collide across
 * documents, so both caches must be reset together when the active document
 * changes — otherwise an incremental recompute could reuse the previous
 * document's geometry. `null` until the first run.
 */
let activeRecomputeSession: string | null = null;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const WARN_FILE_SIZE = 50 * 1024 * 1024; // 50MB



export const createObjectSlice: StateCreator<
    CADState,
    [],
    [],
    ObjectSlice
> = (set, get) => ({
    objects: [],
    selectedIds: new Set(),
    selectionNames: new Map(),
    document: null,
    activeTool: 'select',
    activeTab: 'SOLID',
    code: DEFAULT_CODE,
    activeOperation: null,
    pendingImport: null,
    meshingProgress: null,

    addObject: async (type: CADObject['type'] | string, options: Partial<CADObject> = {}) => {
        // No main-thread kernel init here: the kernel lives in the worker, and
        // nothing on this path calls into it directly.
        const currentState = get();
        const cm = new CodeManager(currentState.code);
        const tool = toolRegistry.get(type);

        if (tool) {
            const params = { ...toolRegistry.getDefaultParams(type), ...options.dimensions };
            if (tool.create) {
                invokeToolCreate(tool, {
                    codeManager: cm,
                    params,
                    scene: {
                        selectedIds: [...currentState.selectedIds],
                        objects: currentState.objects,
                    },
                });
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
                            // Primitives and every operation that yields a body — the
                            // result of a boolean/fillet/chamfer/shell is itself a solid.
                            const isSolid = [
                                'box', 'cylinder', 'sphere', 'torus', 'coil', 'extrusion', 'revolve',
                                'fuse', 'cut', 'intersect', 'fillet', 'chamfer', 'shell',
                            ].includes(obj.type);
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
                invokeToolExecute(tool, {
                    codeManager: cm,
                    params,
                    scene: {
                        selectedIds,
                        objects: currentState.objects,
                    },
                });
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

        // Tool mutation: adopt the document as source of truth (flat code) or fall
        // back to code-as-truth (imperative code). See lib/document/sync.
        set({ ...deriveFromToolCode(cm.getCode()) });
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
            set({ ...deriveFromToolCode(cm.getCode()) });
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
        } else {
            // Keep existing geometries for the new object reference
            migrateGeometries(oldObject, updatedObjects[objectIndex]);
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
            set({ ...deriveFromToolCode(newCode) });
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
        // Additive selection: always toggle the clicked feature on/off.
        // This allows marking multiple features (faces, edges, vertices)
        // simultaneously. Background click uses clearSelection() instead.
        const wasSelected = state.selectedIds.has(id);
        const newSelected = new Set(state.selectedIds);
        const newNames = new Map(state.selectionNames);
        if (wasSelected) {
            newSelected.delete(id);
            newNames.delete(id);
        } else {
            newSelected.add(id);
            // Record the entity's stable name so the selection survives regeneration.
            const name = selectionNameOf(id, state.objects);
            if (name) newNames.set(id, name);
        }

        const updatedObjects = state.objects.map(obj => ({
            ...obj,
            selected: newSelected.has(obj.id),
        }));
        set({ objects: updatedObjects, selectedIds: newSelected, selectionNames: newNames });
    },

    clearSelection: () => {
        const state = get();
        const updatedObjects = state.objects.map(obj => ({ ...obj, selected: false }));
        set({ objects: updatedObjects, selectedIds: new Set(), selectionNames: new Map() });
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
        // Code-first edit: keep the user's text verbatim, derive the document as a
        // view (null when the code isn't representable). Preserves comments/formatting.
        set({ ...deriveFromCodeEdit(code), isSaved: false });
        // We don't push to history on every character,
        // usually history is pushed after runCode (manual or auto-run)
        get().triggerSave();
    },

    runCode: async () => {
        const state = get();
        try {
            const cm = new CodeManager(state.code);
            const executableCode = cm.transformForIncremental();

            // DAG-based incremental execution
            const depGraph = getDependencyGraph();

            // Reset both caches together when the active document changes, so the
            // worker's persistent shape store and depGraph's mesh cache never
            // disagree about a feature id shared between documents.
            const sessionId = state.projectId ?? 'default';
            if (sessionId !== activeRecomputeSession) {
                depGraph.clearCache();
                activeRecomputeSession = sessionId;
            }

            const analysis = depGraph.analyze(state.code);
            const plan = depGraph.createExecutionPlan(state.code, analysis);

            // Get cached results for unchanged features
            const cachedResults = depGraph.getCached(plan.toCache);

            // Log incremental execution stats
            if (plan.toCache.length > 0) {
                console.log(`[Incremental] Executing ${plan.toExecute.length} features, reusing ${plan.toCache.length} from cache`);
            }

            const kernel = getKernelWorker();
            if (!kernel) {
                toast.error('Web workers are not available in this environment');
                return;
            }

            const result = await kernel.execute(
                { type: 'RECOMPUTE', code: executableCode, dirtyIds: plan.toExecute, sessionId },
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

            // Merge new results with cached results. Drive the render set off the
            // shapes main() actually returned (reported by the worker), not the
            // full feature list — so a feature that is still declared but no longer
            // returned (e.g. a solid consumed by a boolean) stops rendering instead
            // of lingering as a ghost from the mesh cache.
            const executedResults = result.meshes;
            const renderOrder: string[] = result.returnedIds ?? analysis.executionOrder;
            const mergedResults = mergeExecutionResults(
                cachedResults,
                executedResults,
                renderOrder
            );

            // Update cache with newly executed results
            depGraph.updateCache(executedResults);

            const shapesArray = mergedResults;

            // Interpret the script into a typed document, and read each object's
            // type/label from it — the principled replacement for the old
            // `lastOpName.includes('box')` guessing, which mislabelled booleans,
            // fillets, chamfers and shells all as "box".
            const doc = documentFromFeatures(cm.getFeatures());

            const newObjects: CADObject[] = shapesArray.map((item: { id: string; meshData?: any; edgeData?: any; vertexData?: any; faceMapping?: any; edgeMapping?: any; fromCache?: boolean }, index: number) => {
                const astId = item.id;
                const existing = state.objects.find(o => o.id === astId);
                let geometry = undefined;
                let edgeGeometry = undefined;
                if (item.meshData) {
                    geometry = buildMeshGeometry(item.meshData);
                }
                if (item.edgeData && item.edgeData.length > 0) {
                    edgeGeometry = buildEdgeGeometry(item.edgeData);
                }

                let vertexGeometry = undefined;
                if (item.vertexData && item.vertexData.length > 0) {
                    vertexGeometry = buildEdgeGeometry(item.vertexData);
                    vertexGeometry.computeBoundingSphere();
                }

                const docObj = doc.getObject(astId);
                const type: CADObject['type'] = docObj?.type || existing?.type || 'box';

                const dimensions = { ...(existing?.dimensions || {}) };
                const planeProp = docObj?.properties.plane;
                if (docObj?.type === 'sketch' && planeProp?.kind === 'text') {
                    dimensions.sketchPlane = planeProp.value;
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

            // Re-resolve face selections against the regenerated geometry: a face
            // that moved to a new index keeps its selection, a face that vanished
            // is dropped. This is the Topological Naming fix at the selection layer.
            // Read the latest selection (runCode is async).
            const cur = get();
            const rec = reconcileFaceSelections(cur.selectedIds, cur.selectionNames, newObjects);
            if (rec.changed) {
                newObjects.forEach(o => { o.selected = rec.selectedIds.has(o.id); });
                set({ objects: newObjects, selectedIds: rec.selectedIds, selectionNames: rec.selectionNames });
            } else {
                set({ objects: newObjects });
            }
        } catch (e: unknown) {
            console.error("Error executing code:", e);
            set({ meshingProgress: null });
            const errorMessage = e instanceof Error ? e.message : String(e);
            toast.error(`Error: ${errorMessage}`);
        }
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

        // Pre-fill boolean operands from an existing selection so a preselection
        // shows up in the dialog (instead of "0 ausgewählt"); the pickers stay
        // editable so selecting in the dialog still works.
        if (type === 'join' || type === 'cut' || type === 'intersect') {
            const base = (id: string) => id.split(':')[0];
            const bodies = [...new Set([...state.selectedIds].map(base))];
            if (bodies[0]) params.target = bodies[0];
            if (bodies[1]) params.tool = bodies[1];
        }

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

        // Booleans need two distinct bodies. Validate here so the user gets clear
        // feedback before we mutate the code (the tool itself is a pure no-op when
        // operands are missing).
        if (type === 'join' || type === 'cut' || type === 'intersect') {
            const base = (id: string) => id.split(':')[0];
            const operands = [...new Set(
                [params?.target, params?.tool].filter(Boolean).map((id: string) => base(id))
            )];
            if (operands.length < 2) {
                toast.error('Select two different bodies for this operation');
                return;
            }
        }

        if ((type === 'extrusion' || type === 'extrude' || type === 'revolve') && params?.selectedShape) {
            const newSelectedIds = new Set([params.selectedShape]);
            set({ selectedIds: newSelectedIds });
        }
        state.addObject(type, { dimensions: params });
        set({ activeOperation: null });
    },

    exportSTL: async () => {
        const state = get();
        const kernel = getKernelWorker();
        if (!kernel) {
            toast.error('Web workers are not available in this environment');
            return;
        }

        const result = await kernel.execute({ type: 'EXPORT_STL', code: state.code });
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
        const kernel = getKernelWorker();
        if (!kernel) {
            toast.error('Web workers are not available in this environment');
            return;
        }

        const result = await kernel.execute({ type: 'EXPORT_STEP', code: state.code });
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

    importFile: (format: ImportFormat = 'all') => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = getImportAccept(format);
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
            if (!matchesImportFormat(extension, format)) {
                toast.error(`Please choose a ${getImportLabel(format)} file.`);
                return;
            }

            const type = getImportedFileType(extension);
            if (!type) {
                toast.error('Unsupported file format');
                return;
            }

            if (file.size > WARN_FILE_SIZE) {
                set({ pendingImport: { file, type, extension } });
                return;
            }

            await get().processImport(file, type, extension);
        };
        input.click();
    },
});

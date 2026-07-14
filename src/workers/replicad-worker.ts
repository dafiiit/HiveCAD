
// The exceptions-enabled OCCT build. The smaller `replicad_single` build has
// exceptions disabled, so a failure OCCT raises internally — an unresolvable
// fillet, a degenerate boolean — traps and poisons the WASM instance instead of
// throwing a catchable error. That makes fillet/chamfer/shell unshippable.
import opencascade from 'replicad-opencascadejs/src/replicad_with_exceptions.js';
import wasmUrl from 'replicad-opencascadejs/src/replicad_with_exceptions.wasm?url';
import * as replicad from 'replicad';
import { installOps } from './ops/install';
import { getElementMap, setElementMap, elementMapOf, buildEdgeMap, type ElementMap, type EdgeGeom } from './ops/elementMap';
import { filletNamed, chamferNamed, shellNamed, edgeGeomOf } from './ops/features';

declare const __record: any;
let initialized = false;

// Initialize OC calling
const initPromise = (async () => {
    try {
        const OC = await opencascade({
            locateFile: () => wasmUrl
        });
        replicad.setOC(OC);
        // Route booleans through our history-capturing ops layer (Stage 2).
        installOps();
        initialized = true;
        console.log("Worker: CAD Kernel Initialized");
    } catch (e) {
        console.error("Worker: Failed to initialize CAD Kernel", e);
        throw e;
    }
})();

interface ImportProgress {
    loaded: number;
    total: number;
    stage: 'reading' | 'parsing' | 'meshing' | 'complete';
}

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

const yieldControl = () => new Promise(resolve => setTimeout(resolve, 0));

async function generateMesh(shapesArray: any[]) {
    const meshes = [];
    const totalShapes = shapesArray.length;

    for (let shapeIndex = 0; shapeIndex < totalShapes; shapeIndex++) {
        const item = shapesArray[shapeIndex];
        const shape = item.shape || item;
        const astId = (shape as any)._astId || `gen-${shapeIndex}`;

        // Stable face names for this shape (attached composed map for a derived
        // shape, or a fresh root map for a primitive). Shared by face + edge naming.
        const elemMap = (shape && shape.faces) ? elementMapOf(shape, astId) : new Map<number, string>();
        // edgeHash → stable combo name, filled during seam analysis below.
        const edgeNameMap = new Map<number, string>();

        let meshData = null;
        let edgeData = null;
        let faceMapping: any[] = [];
        let edgeMapping: any[] = [];

        // Mesh the shape with face mapping
        try {
            let meshable = shape;

            // Check if we can iterate faces (Solid, Shell)
            // We try to use shape.faces to mesh individual faces for selection mapping
            if (shape && shape.type !== 'Sketch' && shape.faces && shape.faces.length > 0) {
                const vertices: number[] = [];
                const indices: number[] = [];
                const normals: number[] = [];
                let vertexOffset = 0;
                let indexOffset = 0;

                // iterate faces
                const faces = Array.from(shape.faces);
                const totalFaces = faces.length;

                // `faceId` is the volatile OCCT index; `name` is what survives
                // regeneration (elemMap was computed once at the top of the loop).
                for (let i = 0; i < totalFaces; i++) {
                    const face: any = faces[i];
                    const faceMesh = face.mesh({ tolerance: 0.1, angularTolerance: 30.0 });

                    if (faceMesh.vertices && faceMesh.triangles) {
                        // Accumulate
                        vertices.push(...faceMesh.vertices);
                        normals.push(...(faceMesh.normals || []));

                        const faceIndices = Array.from(faceMesh.triangles).map((idx: any) => (idx as number) + vertexOffset);
                        indices.push(...faceIndices);

                        // Record mapping: index in the INDICES array, count, volatile
                        // face index, and the stable MappedName for durable selection.
                        faceMapping.push({
                            start: indexOffset,
                            count: faceIndices.length,
                            faceId: i,
                            name: elemMap.get(face.hashCode),
                        });

                        vertexOffset += faceMesh.vertices.length / 3;
                        indexOffset += faceIndices.length;
                    }

                    // Yield and report progress for complex shapes
                    if (totalFaces > 50 && i % Math.max(1, Math.floor(totalFaces / 10)) === 0) {
                        self.postMessage({
                            type: 'MESH_PROGRESS',
                            id: astId,
                            stage: 'faces',
                            progress: Math.floor((i / totalFaces) * 100)
                        });
                        await yieldControl();
                    }
                }

                if (vertices.length > 0) {
                    meshData = {
                        vertices: new Float32Array(vertices),
                        indices: new Uint32Array(indices),
                        normals: new Float32Array(normals)
                    };
                }

            } else {
                // Fallback for Sketches or shapes without faces property
                if (shape && !shape.mesh) {
                    if (typeof shape.face === 'function') meshable = shape.face();
                    else if (shape.face) meshable = shape.face;
                }

                if (meshable && meshable.mesh) {
                    const mesh = meshable.mesh({ tolerance: 0.1, angularTolerance: 30.0 });
                    meshData = {
                        vertices: mesh.vertices,
                        indices: mesh.triangles || mesh.faces,
                        normals: mesh.normals
                    };
                }
            }

        } catch (err) {
            console.error(`Worker: Failed to mesh shape ${shapeIndex}`, err);
        }

        // ── Identify seam edges that should NOT be displayed ──
        //
        // A seam edge is a topological artifact on closed parametric surfaces
        // (cylinder, torus, sphere, cone …).  It exists because the surface's
        // UV parameterisation wraps around, and OpenCascade represents that
        // wrap-around as an edge where the SAME face appears on both sides.
        //
        // Detection rule (works for any shape, no heuristics):
        //   In a valid solid (closed manifold), every real edge borders exactly
        //   2 distinct faces.  If our face→edge adjacency map finds only 1
        //   distinct face for an edge, that edge is a seam — suppress it.
        //
        //   We do NOT use dihedral-angle heuristics: tangent-continuous junctions
        //   between DIFFERENT faces (e.g. a flat side meeting a cylinder surface
        //   at a tangent) are real edges and must be shown.

        // Set of edge hashCodes that should be hidden
        const suppressedEdgeHashes = new Set<number>();

        try {
            if (shape && shape.edges && shape.faces) {
                const faces: any[] = Array.from(shape.faces);
                const edges: any[] = Array.from(shape.edges);

                // Build  edgeHash → [face, face, …]  (one entry per distinct face)
                const edgeFaceMap = new Map<number, any[]>();
                for (const face of faces) {
                    try {
                        const faceEdges: any[] = Array.from(face.edges);
                        for (const fe of faceEdges) {
                            const h = fe.hashCode;
                            if (!edgeFaceMap.has(h)) edgeFaceMap.set(h, []);
                            edgeFaceMap.get(h)!.push(face);
                        }
                    } catch (_) { /* some face types may not expose edges */ }
                }

                // Derive stable edge names from the adjacent faces' names (combo
                // names), disambiguating any face-pair collisions by geometry.
                const edgeAdjacency = new Map<number, number[]>();
                for (const [edgeHash, adjFaces] of edgeFaceMap) {
                    edgeAdjacency.set(edgeHash, adjFaces.map((f: any) => f.hashCode));
                }
                const edgeGeom = new Map<number, EdgeGeom>();
                for (const edge of edges) {
                    try {
                        const h = edge.hashCode;
                        if (!edgeGeom.has(h)) edgeGeom.set(h, edgeGeomOf(edge));
                    } catch { /* skip */ }
                }
                for (const [edgeHash, name] of buildEdgeMap(edgeAdjacency, elemMap, edgeGeom)) {
                    edgeNameMap.set(edgeHash, name);
                }

                for (const edge of edges) {
                    try {
                        const h = edge.hashCode;
                        const adjFaces = edgeFaceMap.get(h) || [];

                        // Seam detection: edge with only 1 adjacent face.
                        // In a valid solid every real edge has 2 distinct adjacent
                        // faces.  1 means the same face wraps around on both sides
                        // (seam edge) but our hash-based iteration counted it once.
                        //
                        // Safety: we exclude PLANE faces because a plane's UV space
                        // never wraps — an edge with 1 adjacent PLANE face would be
                        // a boundary edge on an open shell, not a seam.
                        if (adjFaces.length === 1) {
                            try {
                                const faceType = adjFaces[0].geomType;
                                if (faceType !== 'PLANE') {
                                    suppressedEdgeHashes.add(h);
                                    continue;
                                }
                            } catch (_) { /* keep edge on error */ }
                        }
                    } catch (_) { /* skip this edge on error */ }
                }

                console.log(`Worker: Edge analysis for ${astId}: ${edges.length} total edges, ${suppressedEdgeHashes.size} suppressed (seam)`);
            }
        } catch (err) {
            console.warn(`Worker: Edge analysis failed for ${astId}, falling back to all edges`, err);
        }

        // Extract edges with mapping, filtering out suppressed (seam/smooth) edges
        try {
            if (shape && typeof shape.meshEdges === 'function') {
                const edgeMeshResult = shape.meshEdges({ tolerance: 0.1, angularTolerance: 30.0 });

                if (edgeMeshResult?.lines && edgeMeshResult.lines.length > 0 &&
                    edgeMeshResult.edgeGroups && edgeMeshResult.edgeGroups.length > 0) {

                    // Filter: rebuild lines and edgeGroups, skipping suppressed edges
                    const filteredLines: number[] = [];
                    let newEdgeId = 0;

                    for (const group of edgeMeshResult.edgeGroups) {
                        // group.edgeId is the hashCode set by replicad's meshEdges
                        if (suppressedEdgeHashes.has(group.edgeId)) {
                            continue; // skip seam / smooth edge
                        }

                        const floatStart = group.start * 3;
                        const floatCount = group.count * 3;
                        const segStart = filteredLines.length / 3;

                        for (let i = 0; i < floatCount; i++) {
                            filteredLines.push(edgeMeshResult.lines[floatStart + i]);
                        }

                        edgeMapping.push({
                            start: segStart,
                            count: group.count,
                            edgeId: newEdgeId++,
                            // Stable combo name for durable edge selection (fillet/chamfer).
                            name: edgeNameMap.get(group.edgeId),
                        });
                    }

                    if (filteredLines.length > 0) {
                        edgeData = new Float32Array(filteredLines);
                    }

                    console.log(`Worker: Edges for ${astId}: ${edgeMeshResult.edgeGroups.length} total → ${edgeMapping.length} after filtering (${suppressedEdgeHashes.size} suppressed)`);

                } else if (edgeMeshResult?.lines && edgeMeshResult.lines.length > 0) {
                    // No edgeGroups available – can't filter, fall back to all edges
                    edgeData = new Float32Array(edgeMeshResult.lines);
                    edgeMapping.push({ start: 0, count: edgeData.length / 3, edgeId: 0 });
                    console.log(`Worker: No edgeGroups for ${astId}, using all edges as fallback`);
                }
            }
        } catch (err) {
            console.error(`Worker: Failed to extract edges ${shapeIndex}`, err);
        }

        // ── Extract true topological vertices (corners) ──
        // Only keep vertices that are endpoints of at least one *non-suppressed* edge.
        // This avoids showing false corners on smooth curved surfaces.
        let vertexData = null;
        try {
            if (shape && shape.edges) {
                const edges: any[] = Array.from(shape.edges);

                // Collect endpoint positions of non-suppressed edges
                const cornerCandidates = new Map<string, { x: number, y: number, z: number, count: number }>();

                const addCandidate = (pt: any) => {
                    try {
                        const x = typeof pt.x === 'number' ? pt.x : pt.X?.();
                        const y = typeof pt.y === 'number' ? pt.y : pt.Y?.();
                        const z = typeof pt.z === 'number' ? pt.z : pt.Z?.();
                        if (x == null || y == null || z == null) return;
                        const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
                        const existing = cornerCandidates.get(key);
                        if (existing) {
                            existing.count++;
                        } else {
                            cornerCandidates.set(key, { x, y, z, count: 1 });
                        }
                    } catch { }
                };

                for (const edge of edges) {
                    try {
                        if (suppressedEdgeHashes.has(edge.hashCode)) continue;
                        // Skip truly closed edges (full loops) — they have no
                        // distinct start/end.  Do NOT skip isPeriodic edges:
                        // arcs have isPeriodic=true (underlying curve is a circle)
                        // but they DO have distinct start/end points.
                        if (edge.isClosed) continue;

                        const sp = edge.startPoint;
                        const ep = edge.endPoint;
                        addCandidate(sp);
                        addCandidate(ep);
                        try { sp.delete?.(); ep.delete?.(); } catch { }
                    } catch { }
                }

                // A true corner is a vertex that appears as an endpoint of
                // ≥ 2 non-suppressed, non-closed edges (i.e. where edges actually meet).
                // Single-appearance vertices happen at the end of dangling wires; we keep
                // them too because they can be meaningful (wire endpoints, etc.).
                if (cornerCandidates.size > 0) {
                    const positions: number[] = [];
                    for (const v of cornerCandidates.values()) {
                        if (v.count >= 2) {
                            positions.push(v.x, v.y, v.z);
                        }
                    }
                    if (positions.length > 0) {
                        vertexData = new Float32Array(positions);
                    }
                    console.log(`Worker: Vertices for ${astId}: ${cornerCandidates.size} candidates → ${positions.length / 3} true corners`);
                }
            }
        } catch (err) {
            console.error(`Worker: Failed to extract vertices ${shapeIndex}`, err);
        }

        const namedFaces = faceMapping.filter(f => f.name).length;
        if (namedFaces > 0) {
            const sample = faceMapping.slice(0, 4).map(f => f.name).filter(Boolean).join(', ');
            console.log(`Worker: named ${namedFaces}/${faceMapping.length} faces for ${astId} (e.g. ${sample})`);
        }

        meshes.push({
            id: astId,
            meshData,
            edgeData,
            vertexData,
            faceMapping,
            edgeMapping
        });

        // Small yield between shapes
        if (totalShapes > 1) await yieldControl();
    }
    return meshes;
}

async function importLargeSTL(file: Blob): Promise<void> {
    const total = file.size;
    let loaded = 0;

    const stream = (file as any).stream();
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        // Report progress
        self.postMessage({
            type: 'IMPORT_PROGRESS',
            progress: { loaded, total, stage: 'reading' }
        });
    }

    // Combine chunks and process
    const combined = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
    }

    return processSTL(combined, total);
}

async function importLargeSTEP(file: Blob): Promise<void> {
    const total = file.size;
    let loaded = 0;

    const stream = (file as any).stream();
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        // Report progress
        self.postMessage({
            type: 'IMPORT_PROGRESS',
            progress: { loaded, total, stage: 'reading' }
        });
    }

    // Combine chunks and process
    const combined = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
    }

    return processSTEP(combined, total);
}

async function processSTL(combined: Uint8Array, total: number) {
    self.postMessage({
        type: 'IMPORT_PROGRESS',
        progress: { loaded: total, total, stage: 'parsing' }
    });

    // @ts-ignore
    const shape = await replicad.importSTL(combined.buffer);

    self.postMessage({
        type: 'IMPORT_PROGRESS',
        progress: { loaded: total, total, stage: 'meshing' }
    });

    const shapesArray = Array.isArray(shape) ? shape : [shape];
    const meshes = await generateMesh(shapesArray);

    self.postMessage({
        type: 'IMPORT_PROGRESS',
        progress: { loaded: total, total, stage: 'complete' }
    });

    self.postMessage({ type: 'IMPORT_SUCCESS', meshes });
}

async function processSTEP(combined: Uint8Array, total: number) {
    self.postMessage({
        type: 'IMPORT_PROGRESS',
        progress: { loaded: total, total, stage: 'parsing' }
    });

    // @ts-ignore
    const shape = await replicad.importSTEP(combined.buffer);

    self.postMessage({
        type: 'IMPORT_PROGRESS',
        progress: { loaded: total, total, stage: 'meshing' }
    });

    const shapesArray = Array.isArray(shape) ? shape : [shape];
    const meshes = await generateMesh(shapesArray);

    self.postMessage({
        type: 'IMPORT_PROGRESS',
        progress: { loaded: total, total, stage: 'complete' }
    });

    self.postMessage({ type: 'IMPORT_SUCCESS', meshes });
}

// ────────────────────────────────────────────────────────────────────────────
// Persistent shape store (Stage 1: incremental regeneration)
//
// This worker is the single, long-lived CAD kernel. Between RECOMPUTE calls it
// keeps the computed shape of every feature, keyed by feature id, so a feature
// whose inputs did not change is never rebuilt. The store holds one *clone* per
// feature; the live copy flows through the user's script and is consumed there.
// ────────────────────────────────────────────────────────────────────────────
const shapeStore = new Map<string, any>();
/**
 * Composed ElementMap per feature, kept in parallel to shapeStore. A cached
 * shape is returned as a `.clone()`, and a clone does not carry the WeakMap
 * element-map entry — so we persist maps by feature id here and re-attach them.
 */
const elementMapStore = new Map<string, ElementMap>();
/** The document these shapes belong to. Switching documents clears the store. */
let storeSession: string | null = null;

/** Free an OCCT-backed shape if it exposes a destructor. */
const disposeShape = (shape: any) => {
    try { shape?.delete?.(); } catch { /* already gone */ }
};

const isShapeLike = (v: any): boolean =>
    !!v && typeof v === 'object' && typeof v.clone === 'function';

/**
 * Turn whatever OCCT/replicad threw into a message. OpenCascade's WASM
 * exceptions are frequently a raw pointer (number) or a bare object with no
 * `.message`, which would otherwise surface to the user as "Unknown kernel
 * error". Richer OCCT diagnostics need the OC instance and will come with the
 * Stage 2 ops layer; this at least never yields an empty string.
 */
const describeError = (error: any): string => {
    if (error == null) return 'Unknown kernel error';
    if (typeof error === 'string') return error;
    if (typeof error === 'number') return `OCCT exception (code ${error})`;
    if (typeof error.message === 'string' && error.message) return error.message;
    try {
        const s = String(error);
        return s && s !== '[object Object]' ? s : 'Kernel operation failed (no detail available)';
    } catch {
        return 'Unknown kernel error';
    }
};

/** Tag a value with its feature id (used for mesh↔object mapping). */
const tagShape = (id: string, shape: any) => {
    if (shape && typeof shape === 'object') {
        try { (shape as any)._astId = id; } catch { /* frozen — ignore */ }
    }
    return shape;
};

/** Drop every stored shape (on document switch or explicit reset). */
const clearShapeStore = () => {
    for (const shape of shapeStore.values()) disposeShape(shape);
    shapeStore.clear();
    elementMapStore.clear();
};

// Helper to access a face from a solid by its display index
function getFace(solid: any, faceIndex: number): any {
    if (!solid) {
        throw new Error(`Cannot get face: solid is null or undefined`);
    }

    // Clone the solid to ensure we have a valid reference
    const workingSolid = solid.clone ? solid.clone() : solid;

    if (!workingSolid.faces) {
        console.error("Solid object:", workingSolid);
        throw new Error(`Cannot get face: object does not have faces property`);
    }

    const faces = Array.from(workingSolid.faces);
    if (faceIndex < 0 || faceIndex >= faces.length) {
        throw new Error(`Face index ${faceIndex} out of range (0-${faces.length - 1})`);
    }
    return faces[faceIndex];
}

// Helper to extrude a face from a solid
// Creates a Sketch from the face's outer wire and extrudes it along the face normal
// Based on the approach from replicad manual section 5.2.3
function extrudeFace(solid: any, faceIndex: number, distance: number, options?: any): any {
    const face = getFace(solid, faceIndex);

    // Clone the face to prevent "object has been deleted" errors
    // OpenCascade may garbage collect the face reference
    const faceClone = face.clone ? face.clone() : face;

    // Get the face's properties for creating a sketch
    const outerWire = faceClone.outerWire ? faceClone.outerWire() : null;
    const faceNormal = faceClone.normalAt ? faceClone.normalAt() : null;
    const faceCenter = faceClone.center;

    if (!outerWire) {
        throw new Error(`Cannot extract outer wire from face ${faceIndex}`);
    }

    if (!faceNormal) {
        throw new Error(`Cannot get normal for face ${faceIndex}`);
    }

    // Create a Sketch from the face's outer wire
    const Sketch = (replicad as any).Sketch;

    let faceSketch;
    if (Sketch) {
        try {
            faceSketch = new Sketch(outerWire.clone(), {
                defaultDirection: faceNormal,
                defaultOrigin: faceCenter
            });
        } catch (e) {
            console.error("Failed to create Sketch from wire:", e);
        }
    }

    // Determine extrusion direction (along face normal)
    const extrusionDir = options?.extrusionDirection || [
        faceNormal.x * Math.sign(distance),
        faceNormal.y * Math.sign(distance),
        faceNormal.z * Math.sign(distance)
    ];

    let extrudedShape = null;

    // Method 1: Extrude the sketch we created
    if (faceSketch && faceSketch.extrude) {
        try {
            extrudedShape = faceSketch.extrude(Math.abs(distance), {
                extrusionDirection: extrusionDir
            });
        } catch (e) {
            console.error("Sketch extrusion failed:", e);
        }
    }

    // Method 2: Try face.extrude directly if available
    if (!extrudedShape && face.extrude) {
        try {
            extrudedShape = face.extrude(distance, {
                extrusionDirection: extrusionDir
            });
        } catch (e) {
            console.error("Face.extrude failed:", e);
        }
    }

    // Method 3: Try basicFaceExtrusion
    if (!extrudedShape && face.basicFaceExtrusion) {
        try {
            extrudedShape = face.basicFaceExtrusion(distance);
        } catch (e) {
            console.error("basicFaceExtrusion failed:", e);
        }
    }

    if (!extrudedShape) {
        throw new Error(`Face extrusion failed for face ${faceIndex}. None of the available methods worked.`);
    }

    // If options specify fusing with original solid
    if (options?.fuseWithOriginal !== false && solid.fuse) {
        try {
            return solid.fuse(extrudedShape);
        } catch (e) {
            console.error("Fuse failed, returning standalone extrusion:", e);
            return extrudedShape;
        }
    }

    return extrudedShape;
}

self.onmessage = async (e) => {
    try {
        await initPromise;
    } catch (error: any) {
        // Without this the rejection is unhandled, no message is ever posted,
        // and the caller waits for its timeout.
        self.postMessage({
            type: 'ERROR',
            error: `CAD kernel failed to initialize: ${error?.message ?? error}`,
        });
        return;
    }

    const { type, code, params } = e.data;

    if (type === 'EXECUTE') {
        try {
            const hasDefaultParams = /const\s+defaultParams\s*=/.test(code);
            const mainCall = hasDefaultParams
                ? "\nreturn main(replicad, defaultParams);"
                : "\nreturn main();";

            const evaluator = new Function(
                'replicad', '__record', 'getFace', 'extrudeFace', '__fillet', '__chamfer', '__shell',
                code + mainCall,
            );
            let result = evaluator(replicad, tagShape, getFace, extrudeFace, filletNamed, chamferNamed, shellNamed);

            // Support async main
            if (result instanceof Promise) {
                result = await result;
            }

            let shapesArray: any[] = [];
            if (Array.isArray(result)) {
                shapesArray = result.flat(Infinity);
            } else if (result) {
                shapesArray = [result];
            }

            const meshes = await generateMesh(shapesArray);

            self.postMessage({ type: 'SUCCESS', meshes });

        } catch (error: any) {
            console.error("Worker: Execution Error", error);
            self.postMessage({ type: 'ERROR', error: describeError(error) });
        }
    } else if (type === 'RECOMPUTE') {
        // Incremental execution. The code has been transformed so every feature
        // declaration is `await __memo("id", async () => (expr))`. We only rebuild
        // features whose id is in `dirtyIds` (or that we have no stored shape for),
        // reuse the rest from the store, and mesh only what changed.
        try {
            const { sessionId, dirtyIds } = e.data as {
                sessionId?: string; dirtyIds?: string[];
            };

            // A different document owns the store now — start clean.
            if (sessionId !== storeSession) {
                clearShapeStore();
                storeSession = sessionId ?? null;
            }

            const dirty = new Set<string>(dirtyIds ?? []);
            const seen = new Set<string>();

            const __memo = async (id: string, thunk: () => any) => {
                seen.add(id);

                // Clean *and* already built → hand back a private clone, untouched original stays cached.
                if (!dirty.has(id) && shapeStore.has(id)) {
                    const clone = tagShape(id, shapeStore.get(id).clone());
                    // A clone doesn't carry the WeakMap element-map entry; re-attach it.
                    const em = elementMapStore.get(id);
                    if (em) setElementMap(clone, em);
                    return clone;
                }

                // Dirty, or never built in this session → (re)compute.
                let value = thunk();
                if (value instanceof Promise) value = await value;
                tagShape(id, value);

                if (isShapeLike(value)) {
                    const previous = shapeStore.get(id);
                    if (previous && previous !== value) disposeShape(previous);
                    shapeStore.set(id, value.clone());
                    // Persist the composed map (booleans attach one); primitives have
                    // none here and get a root map on demand at mesh time.
                    const em = getElementMap(value);
                    if (em) elementMapStore.set(id, em);
                }
                return value;
            };

            const hasDefaultParams = /const\s+defaultParams\s*=/.test(code);
            const mainCall = hasDefaultParams
                ? "\nreturn main(replicad, defaultParams);"
                : "\nreturn main();";

            const evaluator = new Function(
                'replicad', '__memo', 'getFace', 'extrudeFace', '__fillet', '__chamfer', '__shell',
                code + mainCall,
            );
            let result = await evaluator(replicad, __memo, getFace, extrudeFace, filletNamed, chamferNamed, shellNamed);

            let shapesArray: any[] = [];
            if (Array.isArray(result)) {
                shapesArray = result.flat(Infinity);
            } else if (result) {
                shapesArray = [result];
            }

            // Evict features that no longer exist in the script (deleted/renamed).
            for (const id of Array.from(shapeStore.keys())) {
                if (!seen.has(id)) {
                    disposeShape(shapeStore.get(id));
                    shapeStore.delete(id);
                    elementMapStore.delete(id);
                }
            }

            // Mesh only what changed. A returned shape with no id (e.g. an inline
            // `return makeBaseBox(...)`) can't be cached, so always mesh it.
            const toMesh = shapesArray.filter(
                (s: any) => !s?._astId || dirty.has(s._astId)
            );
            const meshes = await generateMesh(toMesh);

            // The exact set of shapes main() returned. The main thread renders
            // precisely these — pulling clean ones from its mesh cache — so a
            // feature that is still declared but no longer returned (e.g. an
            // operand consumed by a boolean) correctly disappears.
            const returnedIds = shapesArray
                .map((s: any) => s?._astId)
                .filter((id: any): id is string => typeof id === 'string');

            self.postMessage({ type: 'SUCCESS', meshes, returnedIds });

        } catch (error: any) {
            console.error("Worker: Recompute Error", error);
            self.postMessage({ type: 'ERROR', error: describeError(error) });
        }
    } else if (type === 'EXPORT_STL' || type === 'EXPORT_STEP') {
        try {
            const __record = tagShape;

            const hasDefaultParams = /const\s+defaultParams\s*=/.test(code);
            const mainCall = hasDefaultParams ? "\nreturn main(replicad, defaultParams);" : "\nreturn main();";
            const evaluator = new Function(
                'replicad', '__record', 'getFace', 'extrudeFace', '__fillet', '__chamfer', '__shell',
                code + mainCall,
            );
            let result = evaluator(replicad, __record, getFace, extrudeFace, filletNamed, chamferNamed, shellNamed);
            if (result instanceof Promise) result = await result;

            let shapesArray: any[] = [];
            if (Array.isArray(result)) {
                shapesArray = result.flat(Infinity).map(item => item.shape || item);
            } else if (result) {
                shapesArray = [result.shape || result];
            }

            if (shapesArray.length === 0) {
                throw new Error("No shapes to export");
            }

            let exportShape = shapesArray[0];
            if (shapesArray.length > 1) {
                // Fuse multiple shapes for export
                for (let i = 1; i < shapesArray.length; i++) {
                    exportShape = exportShape.fuse(shapesArray[i]);
                }
            }

            let blob;
            if (type === 'EXPORT_STL') {
                blob = exportShape.blobSTL({ tolerance: 0.1, angularTolerance: 30.0 });
            } else {
                blob = exportShape.blobSTEP();
            }

            self.postMessage({ type: 'EXPORT_SUCCESS', blob });
        } catch (error: any) {
            console.error(`Worker: Export Error (${type})`, error);
            self.postMessage({ type: 'ERROR', error: describeError(error) });
        }
    } else if (type === 'IMPORT_STL' || type === 'IMPORT_STEP') {
        try {
            const { file } = e.data;
            if (type === 'IMPORT_STL') {
                await importLargeSTL(file);
            } else {
                await importLargeSTEP(file);
            }
        } catch (error: any) {
            console.error(`Worker: Import Error (${type})`, error);
            self.postMessage({ type: 'ERROR', error: describeError(error) });
        }
    } else {
        // Every task must terminate with a SUCCESS or an ERROR, or the caller hangs.
        self.postMessage({ type: 'ERROR', error: `Unknown kernel task type: ${type}` });
    }
};

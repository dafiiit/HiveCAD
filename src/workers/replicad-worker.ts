
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import * as replicad from 'replicad';

declare const __record: any;
let initialized = false;

// Initialize OC calling
const initPromise = (async () => {
    try {
        const OC = await opencascade({
            locateFile: () => '/replicad_single.wasm'
        });
        replicad.setOC(OC);
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

                for (let i = 0; i < totalFaces; i++) {
                    const face: any = faces[i];
                    const faceMesh = face.mesh({ tolerance: 0.1, angularTolerance: 30.0 });

                    if (faceMesh.vertices && faceMesh.triangles) {
                        // Accumulate
                        vertices.push(...faceMesh.vertices);
                        normals.push(...(faceMesh.normals || []));

                        const faceIndices = Array.from(faceMesh.triangles).map((idx: any) => (idx as number) + vertexOffset);
                        indices.push(...faceIndices);

                        // Record mapping: start index in the INDICES array, count, and face ID (index)
                        faceMapping.push({
                            start: indexOffset,
                            count: faceIndices.length,
                            faceId: i
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

        // ── Identify seam / smooth edges that should NOT be displayed ──
        // Seam edges are topological artifacts on closed surfaces (cylinder, torus,
        // sphere …).  We also suppress edges whose two adjacent faces are tangent-
        // continuous, i.e. the dihedral angle is ~180° (smooth transition).
        //
        // Strategy
        //   1. Build a map  edgeHash → list-of-adjacent-face-geomTypes  using the
        //      shape topology.
        //   2. Mark an edge as "smooth / seam" when:
        //        a) It is closed (periodic) AND has ≤1 distinct adjacent face, OR
        //        b) ALL adjacent faces are smooth curved surfaces AND the edge is
        //           closed / periodic (pure seam), OR
        //        c) The dihedral angle between the two adjacent faces at the edge
        //           midpoint is close to 180° (tangent-continuous).
        //   3. Only pass the remaining "real" edges to meshEdges output.
        //   4. Vertices (corners) are taken from the topological shape vertices and
        //      kept only if they connect at least one non-smooth edge.

        // Surface types considered "smooth" (curved, can produce seam edges)
        const SMOOTH_SURFACE_TYPES = new Set([
            'CYLINDRE', 'SPHERE', 'TORUS', 'CONE',
            'BEZIER_SURFACE', 'BSPLINE_SURFACE',
            'REVOLUTION_SURFACE', 'EXTRUSION_SURFACE',
            'OFFSET_SURFACE', 'OTHER_SURFACE',
        ]);

        // Angle threshold: if the dihedral angle between two faces at an edge
        // is within this many degrees of 180°, the junction is considered smooth.
        const SMOOTH_ANGLE_DEG = 8; // degrees tolerance
        const SMOOTH_ANGLE_COS = Math.cos((180 - SMOOTH_ANGLE_DEG) * Math.PI / 180);
        // cos(172°) ≈ -0.990; normals nearly opposite → faces tangent-continuous

        // Set of edge hashCodes that should be hidden
        const suppressedEdgeHashes = new Set<number>();

        try {
            if (shape && shape.edges && shape.faces) {
                const faces: any[] = Array.from(shape.faces);
                const edges: any[] = Array.from(shape.edges);

                // Build  edgeHash → [face, face, …]
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

                for (const edge of edges) {
                    try {
                        const h = edge.hashCode;
                        const adjFaces = edgeFaceMap.get(h) || [];

                        // --- Check 1: closed / periodic edge on smooth surfaces → seam ---
                        const isClosed = edge.isClosed === true || edge.isPeriodic === true;
                        if (isClosed) {
                            const allSmooth = adjFaces.length > 0 && adjFaces.every((f: any) => {
                                try { return SMOOTH_SURFACE_TYPES.has(f.geomType); } catch { return false; }
                            });
                            if (allSmooth) {
                                suppressedEdgeHashes.add(h);
                                continue;
                            }
                        }

                        // --- Check 2: dihedral angle ~180° → tangent-continuous joint ---
                        if (adjFaces.length === 2) {
                            try {
                                // Sample the edge midpoint
                                const midPt = edge.pointAt(0.5);
                                const n1 = adjFaces[0].normalAt(midPt);
                                const n2 = adjFaces[1].normalAt(midPt);
                                // Dot product of normals
                                const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
                                // If normals are nearly parallel (dot ≈ +1) or anti-parallel
                                // (dot ≈ -1), the faces are tangent-continuous at this edge.
                                // For a smooth junction the normals point roughly the same
                                // direction (dot ≈ +1) or opposite due to orientation
                                // (dot ≈ -1).  Either way → smooth.
                                if (Math.abs(dot) > Math.abs(SMOOTH_ANGLE_COS)) {
                                    suppressedEdgeHashes.add(h);
                                    continue;
                                }
                                // Clean up replicad Vector objects to avoid leaks
                                try { midPt.delete?.(); n1.delete?.(); n2.delete?.(); } catch { }
                            } catch (_) {
                                // If we can't compute normals, keep the edge (safe default)
                            }
                        }
                    } catch (_) { /* skip this edge on error */ }
                }

                console.log(`Worker: Edge analysis for ${astId}: ${edges.length} total edges, ${suppressedEdgeHashes.size} suppressed (seam/smooth)`);
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
                        // Also skip closed edges — they have no distinct endpoints
                        if (edge.isClosed || edge.isPeriodic) continue;

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

self.onmessage = async (e) => {
    await initPromise;

    const { type, code, params } = e.data;

    if (type === 'EXECUTE') {
        try {
            // Define instrumentation for ID tracking
            const __record = (uuid: string, shape: any) => {
                if (shape && typeof shape === 'object') {
                    try {
                        (shape as any)._astId = uuid;
                    } catch (e) {
                        // ignore
                    }
                }
                return shape;
            };

            // Helper to access a face from a solid by its display index
            const getFace = (solid: any, faceIndex: number): any => {
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
            };

            // Helper to extrude a face from a solid
            // Creates a Sketch from the face's outer wire and extrudes it along the face normal
            // Based on the approach from replicad manual section 5.2.3
            const extrudeFace = (solid: any, faceIndex: number, distance: number, options?: any): any => {
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
                // Based on: new r.Sketch(triBase.clone().outerWire(), { 
                //   defaultDirection: triBase.normalAt(triBase.center), 
                //   defaultOrigin: triBase.center 
                // })
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
            };

            const hasDefaultParams = /const\s+defaultParams\s*=/.test(code);
            const mainCall = hasDefaultParams
                ? "\nreturn main(replicad, defaultParams);"
                : "\nreturn main();";

            const evaluator = new Function('replicad', '__record', 'getFace', 'extrudeFace', code + mainCall);
            let result = evaluator(replicad, __record, getFace, extrudeFace);

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
            self.postMessage({ type: 'ERROR', error: error.message });
        }
    } else if (type === 'EXPORT_STL' || type === 'EXPORT_STEP') {
        try {
            const __record = (uuid: string, shape: any) => {
                if (shape && typeof shape === 'object') {
                    try {
                        (shape as any)._astId = uuid;
                    } catch (e) {
                        // ignore
                    }
                }
                return shape;
            };

            const hasDefaultParams = /const\s+defaultParams\s*=/.test(code);
            const mainCall = hasDefaultParams ? "\nreturn main(replicad, defaultParams);" : "\nreturn main();";
            const evaluator = new Function('replicad', '__record', code + mainCall);
            let result = evaluator(replicad, __record);
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
            self.postMessage({ type: 'ERROR', error: error.message });
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
            self.postMessage({ type: 'ERROR', error: error.message });
        }
    }
};

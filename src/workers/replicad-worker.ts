
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

        // Extract edges with mapping
        try {
            // Try iterating edges
            if (shape && shape.edges && shape.edges.length > 0) {
                const allLines: number[] = [];
                let lineOffset = 0;
                const edges = Array.from(shape.edges);
                const totalEdges = edges.length;

                for (let i = 0; i < totalEdges; i++) {
                    const edge: any = edges[i];
                    const { lines } = edge.mesh({ tolerance: 0.1, angularTolerance: 30.0 });
                    if (lines && lines.length > 0) {
                        allLines.push(...lines);
                        edgeMapping.push({
                            start: lineOffset,
                            count: lines.length, // Number of floats
                            edgeId: i
                        });
                        lineOffset += lines.length;
                    }

                    // Yield and report progress for complex shapes
                    if (totalEdges > 100 && i % Math.max(1, Math.floor(totalEdges / 10)) === 0) {
                        self.postMessage({
                            type: 'MESH_PROGRESS',
                            id: astId,
                            stage: 'edges',
                            progress: Math.floor((i / totalEdges) * 100)
                        });
                        await yieldControl();
                    }
                }

                if (allLines.length > 0) {
                    edgeData = new Float32Array(allLines);
                }

            } else {
                // Fallback
                let edgeSource = shape;
                if (shape && typeof shape.meshEdges !== 'function' && shape.face) {
                    edgeSource = typeof shape.face === 'function' ? shape.face() : shape.face;
                }
                if (edgeSource && typeof edgeSource.meshEdges === 'function') {
                    const { lines } = edgeSource.meshEdges({ tolerance: 0.1, angularTolerance: 30.0 });
                    edgeData = lines;
                }
            }

        } catch (err) {
            console.error(`Worker: Failed to extract edges ${shapeIndex}`, err);
        }

        // Extract vertices (corners) with simple mapping
        let vertexData = null;
        try {
            if (shape && shape.vertices && shape.vertices.length > 0) {
                const verts = Array.from(shape.vertices);
                const positions = new Float32Array(verts.length * 3);
                for (let i = 0; i < verts.length; i++) {
                    const vertex: any = verts[i];
                    // Vertex in Replicad/OC has a point or center property
                    const p = vertex.point || vertex.center;
                    if (p) {
                        positions[i * 3] = p.x;
                        positions[i * 3 + 1] = p.y;
                        positions[i * 3 + 2] = p.z;
                    }
                }
                vertexData = positions;
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
                if (!solid || !solid.faces) {
                    throw new Error(`Cannot get face: object does not have faces property`);
                }
                const faces = Array.from(solid.faces);
                if (faceIndex < 0 || faceIndex >= faces.length) {
                    throw new Error(`Face index ${faceIndex} out of range (0-${faces.length - 1})`);
                }
                return faces[faceIndex];
            };

            // Helper to extrude a face from a solid
            // Uses replicad's basicFaceExtrusion or falls back to manual approach
            const extrudeFace = (solid: any, faceIndex: number, distance: number, options?: any): any => {
                const face = getFace(solid, faceIndex);

                // Try basicFaceExtrusion if available on the face
                if (face.basicFaceExtrusion) {
                    return face.basicFaceExtrusion(distance);
                }

                // Alternative: Use makePrism or sweep approach
                // Get face normal for direction
                const normal = face.normalAt ? face.normalAt() : null;
                if (normal && (replicad as any).makePrism) {
                    const direction = [normal.x * distance, normal.y * distance, normal.z * distance];
                    return (replicad as any).makePrism(face, direction);
                }

                // Last resort: create a shell/loft
                throw new Error(`Face extrusion not supported for this geometry type`);
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

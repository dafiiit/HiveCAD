
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

function generateMesh(shapesArray: any[]) {
    return shapesArray.map((item, index) => {
        const shape = item.shape || item;
        const astId = (shape as any)._astId || `gen-${index}`;

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
                for (let i = 0; i < faces.length; i++) {
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
            console.error(`Worker: Failed to mesh shape ${index}`, err);
        }

        // Extract edges with mapping
        try {
            // Try iterating edges
            if (shape && shape.edges && shape.edges.length > 0) {
                const allLines: number[] = [];
                let lineOffset = 0;
                const edges = Array.from(shape.edges);

                for (let i = 0; i < edges.length; i++) {
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
            console.error(`Worker: Failed to extract edges ${index}`, err);
        }

        return {
            id: astId,
            meshData,
            edgeData,
            faceMapping,
            edgeMapping
        };
    });
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
    const meshes = generateMesh(shapesArray);

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
    const meshes = generateMesh(shapesArray);

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

            const hasDefaultParams = /const\s+defaultParams\s*=/.test(code);
            const mainCall = hasDefaultParams
                ? "\nreturn main(replicad, defaultParams);"
                : "\nreturn main();";

            const evaluator = new Function('replicad', '__record', code + mainCall);
            let result = evaluator(replicad, __record);

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

            const meshes = generateMesh(shapesArray);

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

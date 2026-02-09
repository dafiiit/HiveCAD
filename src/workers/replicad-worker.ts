
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
            console.log(`Worker: Extracting edges for ${astId}`, {
                hasEdges: !!shape?.edges,
                edgesLength: shape?.edges?.length,
                hasMeshEdges: typeof shape?.meshEdges === 'function',
                shapeType: shape?.constructor?.name,
            });

            // Use shape.meshEdges() to get all edge lines at once
            if (shape && typeof shape.meshEdges === 'function') {
                const edgeMeshResult = shape.meshEdges({ tolerance: 0.1, angularTolerance: 30.0 });
                console.log(`Worker: meshEdges result:`, {
                    hasLines: !!edgeMeshResult?.lines,
                    linesLength: edgeMeshResult?.lines?.length,
                    hasEdgeGroups: !!edgeMeshResult?.edgeGroups,
                    edgeGroupsLength: edgeMeshResult?.edgeGroups?.length,
                    resultKeys: edgeMeshResult ? Object.keys(edgeMeshResult) : 'null'
                });

                if (edgeMeshResult?.lines && edgeMeshResult.lines.length > 0) {
                    edgeData = new Float32Array(edgeMeshResult.lines);
                    console.log(`Worker: Created edgeData with ${edgeData.length} floats (${edgeData.length / 6} segments)`);

                    // Create edge mapping from edgeGroups if available
                    if (edgeMeshResult.edgeGroups && edgeMeshResult.edgeGroups.length > 0) {
                        for (const group of edgeMeshResult.edgeGroups) {
                            edgeMapping.push({
                                start: group.start,
                                count: group.count,
                                edgeId: edgeMapping.length // Use index as edge ID
                            });
                        }
                        console.log(`Worker: Created ${edgeMapping.length} edge mappings from edgeGroups`);
                    } else {
                        // Fallback: treat all lines as one edge
                        edgeMapping.push({
                            start: 0,
                            count: edgeData.length,
                            edgeId: 0
                        });
                        console.log(`Worker: Created fallback edge mapping (all lines as one edge)`);
                    }
                } else {
                    console.warn(`Worker: meshEdges returned no lines for ${astId}`);
                }
            } else {
                console.warn(`Worker: shape.meshEdges not available for ${astId}`);
            }

        } catch (err) {
            console.error(`Worker: Failed to extract edges ${shapeIndex}`, err);
        }

        // Extract vertices (corners) from edge line data
        let vertexData = null;
        try {
            console.log(`Worker: Extracting vertices from edge data for ${astId}`, {
                hasEdgeData: !!edgeData,
                edgeDataLength: edgeData?.length
            });

            // Get unique vertices from edge line segments
            if (edgeData && edgeData.length > 0) {
                const vertexSet = new Map<string, { x: number, y: number, z: number }>();

                // Each line segment has 2 vertices (6 floats: x1,y1,z1, x2,y2,z2)
                for (let i = 0; i < edgeData.length; i += 6) {
                    // Start vertex of segment
                    const x1 = edgeData[i];
                    const y1 = edgeData[i + 1];
                    const z1 = edgeData[i + 2];
                    const key1 = `${x1.toFixed(6)},${y1.toFixed(6)},${z1.toFixed(6)}`;
                    vertexSet.set(key1, { x: x1, y: y1, z: z1 });

                    // End vertex of segment
                    const x2 = edgeData[i + 3];
                    const y2 = edgeData[i + 4];
                    const z2 = edgeData[i + 5];
                    const key2 = `${x2.toFixed(6)},${y2.toFixed(6)},${z2.toFixed(6)}`;
                    vertexSet.set(key2, { x: x2, y: y2, z: z2 });
                }

                if (vertexSet.size > 0) {
                    const positions = new Float32Array(vertexSet.size * 3);
                    let idx = 0;
                    for (const vertex of vertexSet.values()) {
                        positions[idx++] = vertex.x;
                        positions[idx++] = vertex.y;
                        positions[idx++] = vertex.z;
                    }
                    vertexData = positions;
                    console.log(`Worker: Created vertexData with ${vertexData.length} floats (${vertexData.length / 3} unique vertices from ${edgeData.length / 6} edge segments)`);
                } else {
                    console.warn(`Worker: No unique vertices found in edge data for ${astId}`);
                }
            } else {
                console.warn(`Worker: No edge data available to extract vertices for ${astId}`);
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

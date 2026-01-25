
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import * as replicad from 'replicad';

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
            const result = evaluator(replicad, __record);

            let shapesArray: any[] = [];
            if (Array.isArray(result)) {
                shapesArray = result.flat(Infinity);
            } else if (result) {
                shapesArray = [result];
            }

            const meshes = shapesArray.map((item, index) => {
                const shape = item.shape || item;
                const astId = (shape as any)._astId || `gen-${index}`;

                let meshData = null;
                let edgeData = null;

                // Mesh the shape
                try {
                    let meshable = shape;
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
                } catch (err) {
                    console.error(`Worker: Failed to mesh shape ${index}`, err);
                }

                // Extract edges
                try {
                    let edgeSource = shape;
                    if (shape && typeof shape.meshEdges !== 'function' && shape.face) {
                        edgeSource = typeof shape.face === 'function' ? shape.face() : shape.face;
                    }
                    if (edgeSource && typeof edgeSource.meshEdges === 'function') {
                        const { lines } = edgeSource.meshEdges({ tolerance: 0.1, angularTolerance: 30.0 });
                        edgeData = lines;
                    }
                } catch (err) {
                    console.error(`Worker: Failed to extract edges ${index}`, err);
                }

                return {
                    id: astId,
                    meshData,
                    edgeData
                };
            });

            self.postMessage({ type: 'SUCCESS', meshes });

        } catch (error: any) {
            console.error("Worker: Execution Error", error);
            self.postMessage({ type: 'ERROR', error: error.message });
        }
    }
};

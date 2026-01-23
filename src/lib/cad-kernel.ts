import { setOC, makeBox, draw, sketchRectangle, sketchCircle, sketchRoundedRectangle, sketchPolysides, Sketcher, makePlane } from 'replicad';
import opencascade from 'replicad-opencascadejs/src/replicad_single.js';
import * as THREE from 'three';

let initialized = false;

export const initCAD = async () => {
    if (initialized) return;

    try {
        // Initialize OpenCascade with the WASM file location
        const OC = await opencascade({
            locateFile: () => '/replicad_single.wasm'
        });

        setOC(OC);
        initialized = true;
        console.log('CAD Kernel Initialized Successfully');
    } catch (error) {
        console.error('Failed to initialize CAD Kernel:', error);
        throw error;
    }
};

export const makeBoxHelper = (width: number, height: number, depth: number) => {
    if (!initialized) throw new Error('CAD Kernel not initialized');
    return makeBox([0, 0, 0], [width, height, depth]);
};

export const createSketchHelper = (points: [number, number][], close: boolean = false) => {
    if (!initialized || points.length < 2) return null;

    let pen = draw(points[0]);
    for (let i = 1; i < points.length; i++) {
        pen = pen.lineTo(points[i]);
    }

    let drawing;
    if (close) {
        drawing = pen.close();
    } else {
        drawing = pen.done();
    }

    // Default to XY plane for now
    return drawing.sketchOnPlane("XY");
};

export const replicadToThreeGeometry = (shape: any): THREE.BufferGeometry => {
    // Tesselate the shape
    const mesh = shape.mesh({
        tolerance: 0.1,
        angularTolerance: 30.0
    });

    // Create BufferGeometry
    const geometry = new THREE.BufferGeometry();

    // Replicad mesh output structure:
    // vertices: Float32Array (flat x,y,z)
    // triangles: Uint32Array (flat indices)
    // normals: Float32Array (flat x,y,z) - optional

    // Check for 'faces' vs 'triangles' property
    const indices = mesh.triangles || mesh.faces;
    const vertices = mesh.vertices;

    if (!vertices || !indices) {
        console.error('Invalid mesh data from replicad:', mesh);
        return geometry;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));

    if (mesh.normals && mesh.normals.length > 0) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mesh.normals), 3));
    } else {
        geometry.computeVertexNormals();
    }

    return geometry;
}


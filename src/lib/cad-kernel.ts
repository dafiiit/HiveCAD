import { setOC, makeBox, draw, sketchRectangle, sketchCircle, sketchRoundedRectangle, sketchPolysides, drawCircle, drawRectangle, drawRoundedRectangle, drawPolysides, Sketcher, makePlane } from 'replicad';
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

export const createSketchFromPrimitives = (primitives: { type: string, points: [number, number][], properties?: any }[]) => {
    if (!initialized || primitives.length === 0) return null;

    const drawings: any[] = [];

    primitives.forEach(prim => {
        try {
            if (prim.type === 'line') {
                if (prim.points.length < 2) return;
                let pen = draw(prim.points[0]);
                for (let i = 1; i < prim.points.length; i++) {
                    pen = pen.lineTo(prim.points[i]);
                }
                drawings.push(pen.done());
            } else if (prim.type === 'rectangle') {
                if (prim.points.length < 2) return;
                const [p1, p2] = prim.points;
                const width = Math.abs(p2[0] - p1[0]);
                const height = Math.abs(p2[1] - p1[1]);
                const centerX = (p1[0] + p2[0]) / 2;
                const centerY = (p1[1] + p2[1]) / 2;

                let rect = drawRoundedRectangle(width, height, 0);
                rect = rect.translate(centerX, centerY);
                drawings.push(rect);
            } else if (prim.type === 'circle') {
                if (prim.points.length < 2) return;
                const [center, edge] = prim.points;
                const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));

                let circ = drawCircle(radius);
                circ = circ.translate(center[0], center[1]);
                drawings.push(circ);
            } else if (prim.type === 'polygon') {
                if (prim.points.length < 2) return;
                const [center, edge] = prim.points;
                const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
                const sides = prim.properties?.sides || 6;

                let poly = drawPolysides(radius, sides);
                poly = poly.translate(center[0], center[1]);
                drawings.push(poly);
            } else if (prim.type === 'spline') {
                if (prim.points.length < 2) return;
                let pen = draw(prim.points[0]);
                for (let i = 1; i < prim.points.length; i++) {
                    pen = pen.smoothSplineTo(prim.points[i]);
                }
                drawings.push(pen.done());
            } else if (prim.type === 'arc') {
                if (prim.points.length < 3) return;
                const [start, end, mid] = prim.points;
                let arc = draw(start).threePointsArcTo(end, mid);
                drawings.push(arc.done());
            }
        } catch (e) {
            console.error(`Failed to create primitive ${prim.type}`, e);
        }
    });

    if (drawings.length === 0) return null;

    let compound = drawings[0];
    for (let i = 1; i < drawings.length; i++) {
        try {
            compound = compound.fuse(drawings[i]);
        } catch (e) {
            console.warn("Fuse failed, maybe disjoint? Keeping separate (not fully supported)", e);
        }
    }

    return compound.sketchOnPlane("XY");
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


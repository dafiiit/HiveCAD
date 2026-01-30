import { setOC, makeBaseBox, makeCylinder, makeSphere, draw, sketchRectangle, sketchCircle, sketchRoundedRectangle, sketchPolysides, drawCircle, drawRectangle, drawRoundedRectangle, drawPolysides, Sketcher, makePlane } from 'replicad';
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
    return makeBaseBox(width, height, depth);
};

export const makeCylinderHelper = (radius: number, height: number) => {
    if (!initialized) throw new Error('CAD Kernel not initialized');
    return makeCylinder(radius, height);
};

export const makeSphereHelper = (radius: number) => {
    if (!initialized) throw new Error('CAD Kernel not initialized');
    return makeSphere(radius);
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

import { PlanarGraph } from './sketch-graph/Graph';
import { LineSegment, ArcSegment, Circle, GeometryType, arcFromThreePoints, Point2D } from './sketch-graph/Geometry';

export const createSketchFromPrimitives = (primitives: { type: string, points: [number, number][], properties?: any }[]) => {
    if (!initialized || primitives.length === 0) return null;

    const graph = new PlanarGraph();

    // 1. Convert Primitives to Graph Geometry
    primitives.forEach(prim => {
        try {
            if (prim.type === 'line') {
                if (prim.points.length < 2) return;
                for (let i = 0; i < prim.points.length - 1; i++) {
                    const p1 = { x: prim.points[i][0], y: prim.points[i][1] };
                    const p2 = { x: prim.points[i + 1][0], y: prim.points[i + 1][1] };
                    graph.addGeometry(new LineSegment(p1, p2));
                }
            } else if (prim.type === 'rectangle') {
                if (prim.points.length < 2) return;
                const [p1arr, p2arr] = prim.points;
                // Axis aligned rect from p1 to p2
                const x1 = Math.min(p1arr[0], p2arr[0]);
                const x2 = Math.max(p1arr[0], p2arr[0]);
                const y1 = Math.min(p1arr[1], p2arr[1]);
                const y2 = Math.max(p1arr[1], p2arr[1]);

                const pA = { x: x1, y: y1 };
                const pB = { x: x2, y: y1 };
                const pC = { x: x2, y: y2 };
                const pD = { x: x1, y: y2 };

                graph.addGeometry(new LineSegment(pA, pB));
                graph.addGeometry(new LineSegment(pB, pC));
                graph.addGeometry(new LineSegment(pC, pD));
                graph.addGeometry(new LineSegment(pD, pA));
            } else if (prim.type === 'circle') {
                if (prim.points.length < 2) return;
                const [c, e] = prim.points;
                const center = { x: c[0], y: c[1] };
                const radius = Math.sqrt(Math.pow(e[0] - c[0], 2) + Math.pow(e[1] - c[1], 2));
                graph.addGeometry(new Circle(center, radius));
            } else if (prim.type === 'arc') {
                if (prim.points.length < 3) return;
                const start = { x: prim.points[0][0], y: prim.points[0][1] };
                const end = { x: prim.points[1][0], y: prim.points[1][1] };
                const mid = { x: prim.points[2][0], y: prim.points[2][1] };

                const arc = arcFromThreePoints(start, end, mid);
                if (arc) graph.addGeometry(arc);
            } else if (prim.type === 'polygon') {
                // Convert to N lines
                if (prim.points.length < 2) return;
                const [c, e] = prim.points;
                const center = { x: c[0], y: c[1] };
                const radius = Math.sqrt(Math.pow(e[0] - c[0], 2) + Math.pow(e[1] - c[1], 2));
                const sides = prim.properties?.sides || 6;

                const points: Point2D[] = [];
                for (let i = 0; i < sides; i++) {
                    const ang = (i / sides) * 2 * Math.PI;
                    points.push({
                        x: center.x + radius * Math.cos(ang),
                        y: center.y + radius * Math.sin(ang)
                    });
                }

                for (let i = 0; i < sides; i++) {
                    const p1 = points[i];
                    const p2 = points[(i + 1) % sides];
                    graph.addGeometry(new LineSegment(p1, p2));
                }
            } else if (prim.type === 'spline') {
                console.warn("Splines are not fully supported in Planar Graph yet. treating as simple segments if possible.");
                if (prim.points.length < 2) return;
                for (let i = 0; i < prim.points.length - 1; i++) {
                    const p1 = { x: prim.points[i][0], y: prim.points[i][1] };
                    const p2 = { x: prim.points[i + 1][0], y: prim.points[i + 1][1] };
                    graph.addGeometry(new LineSegment(p1, p2));
                }
            }
        } catch (e) {
            console.error(`Failed to add primitive ${prim.type} to graph`, e);
        }
    });

    // 2. Compute Topology
    graph.computeTopology();

    // 3. Find Cycles
    const cycles = graph.findCycles();
    if (cycles.length === 0) {
        // Fallback or return null?
        // If we have just lines and no cycles, maybe we want to return the wires?
        // User asked for "Profiles" which implies closed loops.
        // If no loops, return null or maybe a wire sketch?
        // Let's create faces from cycles.
        return null;
    }

    // 4. Create Replicad Geometries from Cycles
    const faces: any[] = [];

    cycles.forEach(cycleInfo => {
        const { edges, direction } = cycleInfo;
        // Start pen at first node of first edge
        const startEdge = edges[0];
        const startDir = direction[0];
        const startPt = startDir ? startEdge.start.point : startEdge.end.point;

        let pen = draw([startPt.x, startPt.y]);

        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            const dir = direction[i]; // true = start->end

            const targetNode = dir ? edge.end : edge.start;
            const targetPt = targetNode.point;

            if (edge.geometry.type === GeometryType.Line) {
                pen = pen.lineTo([targetPt.x, targetPt.y]);
            } else if (edge.geometry.type === GeometryType.Arc) {
                const arc = edge.geometry as ArcSegment;
                // Pen needs to go to targetPt.
                // We need a midpoint to use threePointsArcTo (safest).
                // Or compute tangent...

                // Compute accurate mid angle
                // logic: if ccw, traverse from start->end. if !ccw, ...
                // BUT we are traversing the edge in `dir` (true/false).
                // Edge geometry has inherent start/end/ccw.

                // If traversing `start->end` (dir=true):
                //   We follow the arc geometry direction (if CCW).
                //   Wait, ArcSegment is always CCW from start to end?
                //   My implementation: YES, start/end/ccw.
                //   If dir=true, we move start->end. If ccw=true, we follow arc.
                //   If dir=false, we move end->start.

                // To use threePointsArcTo(end, mid):
                // We need ANY point on the arc segment between current point and target.

                let sAngle = arc.startAngle;
                let eAngle = arc.endAngle;

                // Arc definition: CCW from start to end?
                // My ArcSegment stores `ccw`.
                // If ccw is true, angle sweep is start -> end (CCW).
                // If ccw is false, sweep is start -> end (CW).

                // Calculate mid angle based on Geometry properties
                let midAngle: number;

                // If traversing geometric start->end?
                if (dir) {
                    // Moving start->end
                    if (arc.ccw) {
                        // Simple CCW midpoint
                        let diff = (eAngle - sAngle);
                        if (diff < 0) diff += 2 * Math.PI;
                        midAngle = sAngle + diff / 2;
                    } else {
                        // CW midpoint
                        let diff = (sAngle - eAngle);
                        if (diff < 0) diff += 2 * Math.PI;
                        // sAngle - diff/2
                        midAngle = sAngle - diff / 2;
                    }
                } else {
                    // Moving end->start (reverse traversal)
                    // Start pt is geometry.end. End pt is geometry.start.
                    // eAngle -> sAngle.
                    if (arc.ccw) {
                        // Traversal is CW (against arc)
                        // geometry is CCW start->end.
                        // we go end->start.
                        let diff = (eAngle - sAngle);
                        if (diff < 0) diff += 2 * Math.PI;
                        midAngle = eAngle - diff / 2;
                    } else {
                        // Traversal is CCW (against CW arc)
                        let diff = (sAngle - eAngle);
                        if (diff < 0) diff += 2 * Math.PI;
                        midAngle = eAngle + diff / 2; // ?
                        // eAngle + something to get to sAngle?
                        // CW from start->end means decreasing angle.
                        // end->start means increasing angle.
                    }
                }

                const midPt = {
                    x: arc.center.x + arc.radius * Math.cos(midAngle),
                    y: arc.center.y + arc.radius * Math.sin(midAngle)
                };

                pen = pen.threePointsArcTo([targetPt.x, targetPt.y], [midPt.x, midPt.y]);
            }
        }

        try {
            const poly = pen.close();
            // Replicad/OC might produce invalid wires if self intersecting, but our graph ensures simple cycles.
            // Convert wire to face?
            // sketchOnPlane returns a sketch object which has a face potentially.
            faces.push(poly);
        } catch (e) {
            console.warn("Failed to close cycle", e);
        }
    });

    if (faces.length === 0) return null;

    let compound = faces[0];
    for (let i = 1; i < faces.length; i++) {
        try {
            compound = compound.fuse(faces[i]);
        } catch (e) {
            console.warn("Fuse cycle failed", e);
        }
    }

    return compound.sketchOnPlane("XY");
};

export const replicadToThreeGeometry = (shape: any): THREE.BufferGeometry => {
    let meshable = shape;

    // Handle Sketch objects
    if (shape && !shape.mesh) {
        if (typeof shape.face === 'function') {
            meshable = shape.face();
        } else if (shape.face) {
            meshable = shape.face;
        }
    }

    if (!meshable || typeof meshable.mesh !== 'function') {
        return new THREE.BufferGeometry();
    }

    try {
        const mesh = meshable.mesh({
            tolerance: 0.1,
            angularTolerance: 30.0
        });

        const geometry = new THREE.BufferGeometry();
        const indices = mesh.triangles || mesh.faces;
        const vertices = mesh.vertices;

        if (!vertices || !indices) return geometry;

        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

        if (mesh.normals && mesh.normals.length > 0) {
            geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(mesh.normals), 3));
        } else {
            geometry.computeVertexNormals();
        }

        return geometry;
    } catch (e) {
        console.error("Error meshing shape:", e);
        return new THREE.BufferGeometry();
    }
}

/**
 * Extracts edges from a replicad shape/sketch and converts them to Three.js geometry.
 * Uses meshEdges() for robust extraction.
 */
export const replicadToThreeEdges = (shape: any): { geometry: THREE.BufferGeometry, mapping: any[] } | null => {
    if (!shape) return null;

    try {
        const lines: number[] = [];
        const mapping: any[] = [];

        // Use 'edges' iterator if available (standard in Replicad wrappers)
        const edges = typeof shape.edges === 'function' ? shape.edges() : (shape.edges || []);

        for (const edge of edges) {
            // Mesh the individual edge
            const mesh = edge.mesh({ tolerance: 0.1, angularTolerance: 30.0 });
            if (mesh && mesh.lines && mesh.lines.length > 0) {
                const start = lines.length; // Start index in the float array
                lines.push(...mesh.lines);
                const count = lines.length - start;

                // Store mapping: this range of vertices belongs to this edge ID
                mapping.push({
                    edgeId: edge.id || mapping.length, // Fallback if no ID
                    start,
                    count
                });
            }
        }

        if (lines.length === 0) return null;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lines), 3));

        // Return BOTH geometry and mapping
        return { geometry, mapping };
    } catch (e) {
        console.error("Error extracting edges:", e);
        return null;
    }
}

/**
 * Extracts unique vertices from a replicad shape/sketch and converts them to Three.js geometry.
 */
export const replicadToThreeVertices = (shape: any): THREE.BufferGeometry | null => {
    if (!shape) return null;
    try {
        const vertices: number[] = [];

        // Replicad (OpenCascade) shapes allow iterating vertices
        if (shape.vertices) {
            for (const v of shape.vertices) {
                // v.point gives {x,y,z}
                const p = v.point || v.center;
                if (p) {
                    vertices.push(p.x, p.y, p.z);
                }
            }
        }

        if (vertices.length === 0) return null;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        return geometry;
    } catch (e) {
        console.error("Error extracting vertices:", e);
        return null;
    }
}


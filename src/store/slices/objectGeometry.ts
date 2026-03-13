/**
 * Geometry lifecycle helpers for CAD objects.
 *
 * This module owns the WeakMap-based geometry registry that tracks Three.js
 * BufferGeometry instances attached to CADObjects so they can be disposed
 * when objects are replaced or deleted, preventing GPU memory leaks.
 */
import * as THREE from 'three';
import { CADObject } from '../types';

// ─── Geometry Registry ──────────────────────────────────────────────────────

/** Maps each CADObject (by reference) to its owned geometries. */
const geometryRegistry = new WeakMap<CADObject, THREE.BufferGeometry[]>();

/** Register all buffer geometries owned by `obj` for later disposal. */
export const registerGeometries = (obj: CADObject): void => {
    const geometries = [obj.geometry, obj.edgeGeometry, obj.vertexGeometry]
        .filter((g): g is THREE.BufferGeometry => !!g);
    if (geometries.length > 0) {
        geometryRegistry.set(obj, geometries);
    }
};

/** Dispose all geometries registered for `obj` and remove from the registry. */
export const disposeGeometries = (obj: CADObject): void => {
    if (geometryRegistry.has(obj)) {
        const geometries = geometryRegistry.get(obj)!;
        geometries.forEach(geo => geo.dispose());
        geometryRegistry.delete(obj);
    }
};

/**
 * Migrate the geometry registry entry from `oldObj` to `newObj`.
 * Used when an object is updated in place (new JS reference, same logical object).
 */
export const migrateGeometries = (oldObj: CADObject, newObj: CADObject): void => {
    if (geometryRegistry.has(oldObj)) {
        const geometries = geometryRegistry.get(oldObj)!;
        geometryRegistry.set(newObj, geometries);
        geometryRegistry.delete(oldObj);
    }
};

// ─── Origin Axes ────────────────────────────────────────────────────────────

let cachedAxes: CADObject[] | null = null;

/** Build (or return cached) the three origin-axis CAD objects. */
export const getOriginAxes = (): CADObject[] => {
    if (cachedAxes) return cachedAxes;

    const axisLength = 50;
    const axes: CADObject[] = [
        { id: 'AXIS_X', name: 'X Axis', type: 'datumAxis', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: {}, color: '#ff4444', visible: true, selected: false },
        { id: 'AXIS_Y', name: 'Y Axis', type: 'datumAxis', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: {}, color: '#44ff44', visible: true, selected: false },
        { id: 'AXIS_Z', name: 'Z Axis', type: 'datumAxis', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: {}, color: '#4444ff', visible: true, selected: false },
    ];

    const createAxisGeo = (start: [number, number, number], end: [number, number, number]) => {
        const geo = new THREE.BufferGeometry();
        const vertices = new Float32Array([...start, ...end]);
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        return geo;
    };

    const createHitCylinder = (length: number, axis: 'x' | 'y' | 'z') => {
        const geo = new THREE.CylinderGeometry(2, 2, length);
        if (axis === 'x') { geo.rotateZ(-Math.PI / 2); geo.translate(length / 2, 0, 0); }
        if (axis === 'y') { geo.translate(0, length / 2, 0); }
        if (axis === 'z') { geo.rotateX(Math.PI / 2); geo.translate(0, 0, length / 2); }
        return geo;
    };

    // X Axis
    axes[0].geometry = createHitCylinder(axisLength, 'x');
    axes[0].geometry.computeBoundingSphere();
    axes[0].edgeGeometry = createAxisGeo([0, 0, 0], [axisLength, 0, 0]);
    axes[0].edgeGeometry.computeBoundingSphere();

    // Y Axis
    axes[1].geometry = createHitCylinder(axisLength, 'y');
    axes[1].geometry.computeBoundingSphere();
    axes[1].edgeGeometry = createAxisGeo([0, 0, 0], [0, axisLength, 0]);
    axes[1].edgeGeometry.computeBoundingSphere();

    // Z Axis
    axes[2].geometry = createHitCylinder(axisLength, 'z');
    axes[2].geometry.computeBoundingSphere();
    axes[2].edgeGeometry = createAxisGeo([0, 0, 0], [0, 0, axisLength]);
    axes[2].edgeGeometry.computeBoundingSphere();

    cachedAxes = axes;
    return axes;
};

// ─── Object Color Cycling ───────────────────────────────────────────────────

const DEFAULT_COLORS = ['#6090c0', '#c06060', '#60c060', '#c06060', '#c0c060', '#60c0c0'];
let colorIndex = 0;

/** Return the next color from the cyclic default palette. */
export const getNextColor = (): string => {
    const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
    colorIndex++;
    return color;
};

// ─── Mesh Data → Three.js Geometry Conversion ───────────────────────────────

/** Build a THREE.BufferGeometry from raw mesh data returned by the worker. */
export function buildMeshGeometry(meshData: {
    vertices: number[];
    indices?: number[];
    normals?: number[];
}): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(meshData.vertices), 3));
    if (meshData.indices) {
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshData.indices), 1));
    }
    if (meshData.normals && meshData.normals.length > 0) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(meshData.normals), 3));
    } else {
        geometry.computeVertexNormals();
    }
    geometry.computeBoundingSphere();
    return geometry;
}

/** Build a THREE.BufferGeometry for edges from raw flat float data. */
export function buildEdgeGeometry(edgeData: number[]): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgeData), 3));
    geometry.computeBoundingSphere();
    return geometry;
}

import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TOP_VIEW_UP = new THREE.Vector3(0, 0, -1);
const BOTTOM_VIEW_UP = new THREE.Vector3(0, 0, 1);
const FALLBACK_DIRECTION = new THREE.Vector3(0, 0, 1);
const AXIS_ALIGNMENT_EPSILON = 1e-6;

export interface ViewCubeCameraPose {
    direction: THREE.Vector3;
    position: THREE.Vector3;
    up: THREE.Vector3;
}

function canonicalizeVector(vector: THREE.Vector3): THREE.Vector3 {
    if (Math.abs(vector.x) <= AXIS_ALIGNMENT_EPSILON) vector.x = 0;
    if (Math.abs(vector.y) <= AXIS_ALIGNMENT_EPSILON) vector.y = 0;
    if (Math.abs(vector.z) <= AXIS_ALIGNMENT_EPSILON) vector.z = 0;
    return vector;
}

function normalizeDirection(direction: THREE.Vector3): THREE.Vector3 {
    const normalized = direction.clone();

    if (normalized.lengthSq() <= AXIS_ALIGNMENT_EPSILON) {
        return FALLBACK_DIRECTION.clone();
    }

    return canonicalizeVector(normalized.normalize());
}

export function getCanonicalViewCubeUp(direction: THREE.Vector3): THREE.Vector3 {
    const normalizedDirection = normalizeDirection(direction);

    if (Math.abs(Math.abs(normalizedDirection.y) - 1) <= AXIS_ALIGNMENT_EPSILON) {
        return (normalizedDirection.y > 0 ? TOP_VIEW_UP : BOTTOM_VIEW_UP).clone();
    }

    const right = new THREE.Vector3().crossVectors(WORLD_UP, normalizedDirection).normalize();
    return canonicalizeVector(new THREE.Vector3().crossVectors(normalizedDirection, right).normalize());
}

export function computeViewCubeCameraPose(
    direction: THREE.Vector3,
    target: THREE.Vector3,
    radius: number,
): ViewCubeCameraPose {
    const normalizedDirection = normalizeDirection(direction);
    const safeRadius = Math.max(radius, AXIS_ALIGNMENT_EPSILON);

    return {
        direction: normalizedDirection,
        position: target.clone().addScaledVector(normalizedDirection, safeRadius),
        up: getCanonicalViewCubeUp(normalizedDirection),
    };
}
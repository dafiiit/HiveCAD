import * as THREE from 'three';
import { computeViewCubeCameraPose, getCanonicalViewCubeUp } from './viewCubeSnap';

describe('viewCubeSnap', () => {
    it('uses a fixed roll for the top and bottom views', () => {
        expect(getCanonicalViewCubeUp(new THREE.Vector3(0, 1, 0)).toArray()).toEqual([0, 0, -1]);
        expect(getCanonicalViewCubeUp(new THREE.Vector3(0, -1, 0)).toArray()).toEqual([0, 0, 1]);
    });

    it('keeps front and side views aligned with world up', () => {
        expect(getCanonicalViewCubeUp(new THREE.Vector3(0, 0, 1)).toArray()).toEqual([0, 1, 0]);
        expect(getCanonicalViewCubeUp(new THREE.Vector3(1, 0, 0)).toArray()).toEqual([0, 1, 0]);
    });

    it('builds an orthonormal camera pose for diagonal snaps', () => {
        const target = new THREE.Vector3(1, 2, 3);
        const pose = computeViewCubeCameraPose(new THREE.Vector3(1, 1, 1), target, 10);
        const viewDirection = pose.position.clone().sub(target).normalize();
        const right = new THREE.Vector3().crossVectors(pose.up, viewDirection).normalize();

        expect(viewDirection.distanceTo(pose.direction)).toBeLessThan(1e-10);
        expect(Math.abs(pose.up.length() - 1)).toBeLessThan(1e-10);
        expect(Math.abs(pose.up.dot(viewDirection))).toBeLessThan(1e-10);
        expect(Math.abs(right.length() - 1)).toBeLessThan(1e-10);
    });
});
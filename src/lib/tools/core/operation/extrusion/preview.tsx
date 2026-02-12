import React from 'react';
import * as THREE from 'three';
import type { CADObject } from '../../../../store/types';
import { InteractivePreviewHandle } from '@/components/cad/InteractivePreviewHandle';

export function renderExtrusionPreview(
    params: Record<string, any>,
    context: {
        selectedIds: string[];
        objects: CADObject[];
        updateOperationParams: (params: Record<string, any>) => void;
        setCameraControlsDisabled: (disabled: boolean) => void;
    }
) {
    const { objects, selectedIds, updateOperationParams, setCameraControlsDisabled } = context;

    // Automatically use selection if profile not set
    const profileId = params.profile || selectedIds.find(id => id.includes('sketch') || id.includes(':face-'));
    const axisId = params.axis || selectedIds.find(id => id.includes('edge') || id.includes('AXIS_'));
    const distance = params.distance !== undefined ? params.distance : 10;

    if (!profileId) return null;

    const [baseId, faceSuffix] = profileId.includes(':face-') ? profileId.split(':face-') : [profileId, null];
    const sourceObject = objects.find(obj => obj.id === baseId);
    if (!sourceObject) return null;

    // 1. Determine base geometry
    let baseGeometry = sourceObject.geometry;
    let boundaryGeometry = sourceObject.edgeGeometry;

    if (faceSuffix && sourceObject.geometry && sourceObject.faceMapping) {
        const faceId = parseInt(faceSuffix);
        const mapping = sourceObject.faceMapping.find(m => m.faceId === faceId);
        if (mapping) {
            const subGeo = new THREE.BufferGeometry();
            const posAttr = sourceObject.geometry.getAttribute('position');
            const normAttr = sourceObject.geometry.getAttribute('normal');

            if (sourceObject.geometry.index) {
                const indices = sourceObject.geometry.index.array;
                const subIndices: number[] = [];
                for (let i = 0; i < mapping.count; i++) {
                    subIndices.push(indices[mapping.start + i]);
                }
                subGeo.setAttribute('position', posAttr);
                if (normAttr) subGeo.setAttribute('normal', normAttr);
                subGeo.setIndex(subIndices);
            } else {
                const vertices = new Float32Array(mapping.count * 3);
                const normals = normAttr ? new Float32Array(mapping.count * 3) : null;
                for (let i = 0; i < mapping.count; i++) {
                    const idx = mapping.start + i;
                    vertices[i * 3] = posAttr.getX(idx);
                    vertices[i * 3 + 1] = posAttr.getY(idx);
                    vertices[i * 3 + 2] = posAttr.getZ(idx);
                    if (normals) {
                        normals[i * 3] = normAttr.getX(idx);
                        normals[i * 3 + 1] = normAttr.getY(idx);
                        normals[i * 3 + 2] = normAttr.getZ(idx);
                    }
                }
                subGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                if (normals) subGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            }
            baseGeometry = subGeo;
        }
    }

    if (!baseGeometry) return null;

    // 2. Determine extrusion direction
    let direction = new THREE.Vector3(0, 0, 1);
    if (axisId) {
        if (axisId === 'AXIS_X') direction.set(1, 0, 0);
        else if (axisId === 'AXIS_Y') direction.set(0, 1, 0);
        else if (axisId === 'AXIS_Z') direction.set(0, 0, 1);
        else if (typeof axisId === 'object' && axisId.type === 'raw') {
            try {
                const content = axisId.content.replace('[', '').replace(']', '').split(',').map(Number);
                if (content.length === 3) direction.set(content[0], content[1], content[2]).normalize();
            } catch (e) { }
        } else {
            const axisObj = objects.find(obj => obj.id === axisId || axisId.startsWith(obj.id + ':edge-'));
            if (axisObj && axisObj.edgeGeometry) {
                const pos = axisObj.edgeGeometry.getAttribute('position');
                if (pos.count >= 2) {
                    const start = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0));
                    const end = new THREE.Vector3(pos.getX(1), pos.getY(1), pos.getZ(1));
                    direction.subVectors(end, start).normalize();
                }
            }
        }
    } else if (faceSuffix && baseGeometry.getAttribute('normal')) {
        const normAttr = baseGeometry.getAttribute('normal');
        const avgNorm = new THREE.Vector3();
        for (let i = 0; i < normAttr.count; i++) {
            avgNorm.add(new THREE.Vector3(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)));
        }
        direction.copy(avgNorm.divideScalar(normAttr.count).normalize());
    } else {
        const sketchPlane = sourceObject.dimensions?.sketchPlane || 'XY';
        if (sketchPlane === 'XZ') direction.set(0, 1, 0);
        else if (sketchPlane === 'YZ') direction.set(1, 0, 0);
    }

    const offsetVec = direction.clone().multiplyScalar(distance);
    const offsetArray: [number, number, number] = [offsetVec.x, offsetVec.y, offsetVec.z];

    // 3. Create preview nodes
    const previewNodes: React.ReactNode[] = [
        // Ghost Base
        React.createElement('mesh', { key: 'base' },
            React.createElement('primitive', { object: baseGeometry, attach: "geometry" }),
            React.createElement('meshStandardMaterial', { color: "#80c0ff", transparent: true, opacity: 0.3, side: THREE.DoubleSide })
        ),
        // Ghost End Cap
        React.createElement('mesh', { key: 'endcap', position: offsetArray },
            React.createElement('primitive', { object: baseGeometry, attach: "geometry" }),
            React.createElement('meshStandardMaterial', { color: "#80c0ff", transparent: true, opacity: 0.6, side: THREE.DoubleSide })
        )
    ];

    // Add side walls if we have boundary edges
    if (boundaryGeometry) {
        const sideWallVertices: number[] = [];
        const pos = boundaryGeometry.getAttribute('position');
        for (let i = 0; i < pos.count; i += 2) {
            const v1 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
            const v2 = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
            const v3 = v2.clone().add(offsetVec);
            const v4 = v1.clone().add(offsetVec);

            sideWallVertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
            sideWallVertices.push(v1.x, v1.y, v1.z, v3.x, v3.y, v3.z, v4.x, v4.y, v4.z);
        }
        if (sideWallVertices.length > 0) {
            previewNodes.push(
                React.createElement('mesh', { key: `sidewalls-${distance}` },
                    React.createElement('bufferGeometry', {},
                        React.createElement('bufferAttribute', {
                            attach: 'attributes-position',
                            count: sideWallVertices.length / 3,
                            array: new Float32Array(sideWallVertices),
                            itemSize: 3
                        })
                    ),
                    React.createElement('meshStandardMaterial', { color: "#80c0ff", transparent: true, opacity: 0.4, side: THREE.DoubleSide })
                )
            );
        }
    }

    // 4. Add Interactive Handle at the center of the face
    baseGeometry.computeBoundingBox();
    const center = new THREE.Vector3();
    baseGeometry.boundingBox?.getCenter(center);

    const effectiveDirection = distance >= 0 ? direction : direction.clone().negate();

    previewNodes.push(
        React.createElement(InteractivePreviewHandle, {
            key: 'handle',
            position: [center.x, center.y, center.z],
            direction: [effectiveDirection.x, effectiveDirection.y, effectiveDirection.z],
            distance: distance,
            onDrag: (d: number) => updateOperationParams({ distance: d }),
            onDragStart: () => setCameraControlsDisabled(true),
            onDragEnd: () => setCameraControlsDisabled(false),
            label: `Distance: ${distance.toFixed(1)}mm`
        })
    );

    return React.createElement('group', {
        position: sourceObject.position,
        rotation: sourceObject.rotation
    }, previewNodes);
}

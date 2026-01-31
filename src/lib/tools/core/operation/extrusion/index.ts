import React from 'react';
import * as THREE from 'three';
import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';
import { InteractivePreviewHandle } from '@/components/cad/InteractivePreviewHandle';

export const extrusionTool: Tool = {
    metadata: {
        id: 'extrusion',
        label: 'Extrude',
        icon: 'ArrowUp',
        category: 'operation',
        description: 'Extrude a sketch or face into a 3D solid',
        shortcut: 'E'
    },
    uiProperties: [
        {
            key: 'profile',
            label: 'Profile',
            type: 'selection',
            default: null,
            allowedTypes: ['sketch', 'face']
        },
        {
            key: 'axis',
            label: 'Axis',
            type: 'selection',
            default: null,
            allowedTypes: ['edge', 'datumAxis']
        },
        { key: 'distance', label: 'Distance', type: 'number', default: 10, unit: 'mm' },
        {
            key: 'operation',
            label: 'Operation',
            type: 'select',
            default: 'new',
            options: [
                { value: 'new', label: 'New Body' },
                { value: 'join', label: 'Join' },
                { value: 'cut', label: 'Cut' },
                { value: 'intersect', label: 'Intersect' }
            ]
        },
        { key: 'twistAngle', label: 'Twist Angle', type: 'number', default: 0, unit: 'deg' },
        { key: 'endFactor', label: 'End Factor', type: 'number', default: 1, min: 0, max: 2, step: 0.1 }
    ],
    selectionRequirements: {
        min: 1,
        max: 2,
        allowedTypes: ['sketch', 'face', 'edge', 'datumAxis']
    },
    execute(codeManager: CodeManager, selectedIds: string[], params: Record<string, any>): void {
        const profile = params.profile || selectedIds.find(id => id.includes('sketch') || id.includes(':face-'));
        if (!profile) return;

        const distance = params.distance !== undefined ? params.distance : 10;
        const axis = params.axis;
        const twistAngle = params.twistAngle;
        const endFactor = params.endFactor;

        const extrudeArgs: any[] = [distance];
        const opts: Record<string, any> = {};

        if (axis) {
            if (axis === 'AXIS_X') opts.extrusionDirection = [1, 0, 0];
            else if (axis === 'AXIS_Y') opts.extrusionDirection = [0, 1, 0];
            else if (axis === 'AXIS_Z') opts.extrusionDirection = [0, 0, 1];
            else opts.extrusionDirection = { type: 'raw', content: axis };
        }

        if (twistAngle) opts.twistAngle = twistAngle;
        if (endFactor !== 1) opts.endFactor = endFactor;

        // Check if selecting a face of a solid
        if (profile.includes(':face-')) {
            const [baseId, faceStr] = profile.split(':face-');
            const faceIndex = parseInt(faceStr);

            if (!isNaN(faceIndex)) {
                const faceVar = codeManager.addFeature('face', baseId, [faceIndex]);
                if (Object.keys(opts).length > 0) extrudeArgs.push(opts);
                codeManager.addFeature('extrude', faceVar, extrudeArgs);

                // Handle boolean operations if selected
                if (params.operation && params.operation !== 'new') {
                    // This would need more complex logic to apply the boolean to the base object
                    // For now, let's keep it simple
                }
                return;
            }
        }

        // Normal Sketch Extrusion
        if (Object.keys(opts).length > 0) extrudeArgs.push(opts);
        codeManager.addOperation(profile, 'extrude', extrudeArgs);
    },
    onPropertyChange(params, key, value, objects) {
        if (key === 'profile' && value && value.includes(':face-')) {
            const [baseId, faceSuffix] = value.split(':face-');
            const obj = objects.find(o => o.id === baseId);
            if (obj && obj.geometry && obj.faceMapping) {
                const faceId = parseInt(faceSuffix);
                const mapping = obj.faceMapping.find(m => m.faceId === faceId);
                if (mapping && obj.geometry.getAttribute('normal')) {
                    const normAttr = obj.geometry.getAttribute('normal');
                    const avgNorm = new THREE.Vector3();

                    // If indexed
                    if (obj.geometry.index) {
                        const indices = obj.geometry.index.array;
                        for (let i = 0; i < mapping.count; i++) {
                            const idx = indices[mapping.start + i];
                            avgNorm.add(new THREE.Vector3(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx)));
                        }
                    } else {
                        for (let i = 0; i < mapping.count; i++) {
                            const idx = mapping.start + i;
                            avgNorm.add(new THREE.Vector3(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx)));
                        }
                    }

                    avgNorm.divideScalar(mapping.count).normalize();

                    // Format axis as raw code for normal direction
                    // If it's close to a standard axis, we could use AXIS_X etc.
                    const eps = 0.001;
                    let axisVal: any = { type: 'raw', content: `[${avgNorm.x.toFixed(4)}, ${avgNorm.y.toFixed(4)}, ${avgNorm.z.toFixed(4)}]` };

                    if (Math.abs(avgNorm.x - 1) < eps && Math.abs(avgNorm.y) < eps && Math.abs(avgNorm.z) < eps) axisVal = 'AXIS_X';
                    else if (Math.abs(avgNorm.x + 1) < eps && Math.abs(avgNorm.y) < eps && Math.abs(avgNorm.z) < eps) axisVal = { type: 'raw', content: '[-1, 0, 0]' };
                    else if (Math.abs(avgNorm.y - 1) < eps && Math.abs(avgNorm.x) < eps && Math.abs(avgNorm.z) < eps) axisVal = 'AXIS_Y';
                    else if (Math.abs(avgNorm.y + 1) < eps && Math.abs(avgNorm.x) < eps && Math.abs(avgNorm.z) < eps) axisVal = { type: 'raw', content: '[0, -1, 0]' };
                    else if (Math.abs(avgNorm.z - 1) < eps && Math.abs(avgNorm.x) < eps && Math.abs(avgNorm.y) < eps) axisVal = 'AXIS_Z';
                    else if (Math.abs(avgNorm.z + 1) < eps && Math.abs(avgNorm.x) < eps && Math.abs(avgNorm.y) < eps) axisVal = { type: 'raw', content: '[0, 0, -1]' };

                    // Only set if axis is not already manually set
                    if (!params.axis) {
                        return { axis: axisVal };
                    }
                }
            }
        }
    },
    render3DPreview(params, { objects, selectedIds, updateOperationParams, setCameraControlsDisabled }) {
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
                // Extract face triangles
                const subGeo = new THREE.BufferGeometry();
                const posAttr = sourceObject.geometry.getAttribute('position');
                const normAttr = sourceObject.geometry.getAttribute('normal');

                // If geometry is indexed, extract based on indices
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
                    // Non-indexed
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
                    // content might be like "[x, y, z]"
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
            // Calculate average face normal
            const normAttr = baseGeometry.getAttribute('normal');
            const avgNorm = new THREE.Vector3();
            for (let i = 0; i < normAttr.count; i++) {
                avgNorm.add(new THREE.Vector3(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)));
            }
            direction.copy(avgNorm.divideScalar(normAttr.count).normalize());
        } else {
            // Default direction based on sketch plane
            const sketchPlane = sourceObject.dimensions?.sketchPlane || 'XY';
            if (sketchPlane === 'XZ') direction.set(0, 1, 0);
            else if (sketchPlane === 'YZ') direction.set(1, 0, 0);
        }

        const offsetVec = direction.clone().multiplyScalar(distance);
        // Convert to array for React Three Fiber
        const offsetArray: [number, number, number] = [offsetVec.x, offsetVec.y, offsetVec.z];

        // 3. Create Side Walls (Quads connecting base edges to top edges)
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

        // Determine effective direction for the handle (flip if distance is negative)
        const effectiveDirection = distance >= 0 ? direction : direction.clone().negate();
        const effectiveDistance = Math.abs(distance);

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
};

export default extrusionTool;

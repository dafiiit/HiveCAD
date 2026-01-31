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
    render3DPreview(params, { objects, selectedIds, updateOperationParams }) {
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
            else {
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
        } else {
            // Default direction based on sketch plane or face normal
            const sketchPlane = sourceObject.dimensions?.sketchPlane || 'XY';
            if (sketchPlane === 'XZ') direction.set(0, 1, 0);
            else if (sketchPlane === 'YZ') direction.set(1, 0, 0);
        }

        const offsetVec = direction.clone().multiplyScalar(distance);

        // 3. Create Side Walls (Quads connecting base edges to top edges)
        const previewNodes: React.ReactNode[] = [
            // Ghost Base
            React.createElement('mesh', { key: 'base', geometry: baseGeometry },
                React.createElement('meshStandardMaterial', { color: "#80c0ff", transparent: true, opacity: 0.3, side: THREE.DoubleSide })
            ),
            // Ghost End Cap
            React.createElement('mesh', { key: 'endcap', geometry: baseGeometry, position: offsetVec },
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
                const sideWallGeo = new THREE.BufferGeometry();
                sideWallGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sideWallVertices), 3));
                sideWallGeo.computeVertexNormals();
                previewNodes.push(
                    React.createElement('mesh', { key: 'sidewalls', geometry: sideWallGeo },
                        React.createElement('meshStandardMaterial', { color: "#80c0ff", transparent: true, opacity: 0.4, side: THREE.DoubleSide })
                    )
                );
            }
        }

        // 4. Add Interactive Handle at the center of the face
        baseGeometry.computeBoundingBox();
        const center = new THREE.Vector3();
        baseGeometry.boundingBox?.getCenter(center);

        previewNodes.push(
            React.createElement(InteractivePreviewHandle, {
                key: 'handle',
                position: [center.x, center.y, center.z],
                direction: [direction.x, direction.y, direction.z],
                distance: distance,
                onDrag: (d: number) => updateOperationParams({ distance: d }),
                label: `Distance: ${distance}mm`
            })
        );

        return React.createElement('group', {
            position: sourceObject.position,
            rotation: sourceObject.rotation
        }, previewNodes);
    }
};

export default extrusionTool;

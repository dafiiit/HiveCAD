import * as THREE from 'three';
import type { Tool } from '../../../types';
import type { CodeManager } from '../../../../code-manager';
import { renderExtrusionPreview } from './preview';

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
                // For face extrusion, we don't pass extrusionDirection since
                // the face normal is used automatically. Only pass simple options.
                const faceOpts: Record<string, any> = {};
                if (twistAngle) faceOpts.twistAngle = twistAngle;
                if (endFactor !== undefined && endFactor !== 1) faceOpts.endFactor = endFactor;

                // Use the new addFaceExtrusion method which generates:
                // const faceExt1 = solid.fuse(extrudeFace(solid, faceIndex, distance, opts));
                const resultVar = codeManager.addFaceExtrusion(baseId, faceIndex, distance, faceOpts);

                // Handle boolean operations if selected
                if (params.operation && params.operation !== 'new' && resultVar) {
                    // Apply boolean between original solid and the new extrusion
                    const methodMap: Record<string, string> = { join: 'fuse', cut: 'cut', intersect: 'intersect' };
                    const methodName = methodMap[params.operation];
                    if (methodName) {
                        codeManager.addOperation(baseId, methodName, [{ type: 'raw', content: resultVar }]);
                    }
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
    render3DPreview: renderExtrusionPreview,
};

export default extrusionTool;

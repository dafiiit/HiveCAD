import * as THREE from 'three';
import type { CodeManager } from '../../../../code-manager';
import type { CADObject } from '../../../../../store/types';

export interface ExtrusionParams {
    profile?: string | null;
    axis?: string | { type: 'raw'; content: string } | null;
    distance?: number;
    operation?: 'new' | 'join' | 'cut' | 'intersect';
    twistAngle?: number;
    endFactor?: number;
}

export interface ExtrusionExecutionContext {
    codeManager: CodeManager;
    selectedIds: string[];
    params: Record<string, any>;
}

export function normalizeExtrusionParams(
    params: Record<string, any>,
    selectedIds: string[],
): Required<Pick<ExtrusionParams, 'distance' | 'operation' | 'endFactor'>> & ExtrusionParams {
    const profile = params.profile || selectedIds.find((id) => id.includes('sketch') || id.includes(':face-'));
    return {
        profile,
        axis: params.axis,
        distance: params.distance !== undefined ? params.distance : 10,
        operation: params.operation ?? 'new',
        twistAngle: params.twistAngle,
        endFactor: params.endFactor,
    };
}

function buildExtrusionOptions(axis: ExtrusionParams['axis'], twistAngle?: number, endFactor?: number): Record<string, any> {
    const opts: Record<string, any> = {};

    if (axis) {
        if (axis === 'AXIS_X') opts.extrusionDirection = [1, 0, 0];
        else if (axis === 'AXIS_Y') opts.extrusionDirection = [0, 1, 0];
        else if (axis === 'AXIS_Z') opts.extrusionDirection = [0, 0, 1];
        else opts.extrusionDirection = axis;
    }

    if (twistAngle) opts.twistAngle = twistAngle;
    if (endFactor !== undefined && endFactor !== 1) opts.endFactor = endFactor;

    return opts;
}

export function executeExtrusion(context: ExtrusionExecutionContext): void {
    const { codeManager, selectedIds, params } = context;
    const normalized = normalizeExtrusionParams(params, selectedIds);
    const profile = normalized.profile;

    if (!profile) return;

    const opts = buildExtrusionOptions(normalized.axis, normalized.twistAngle, normalized.endFactor);

    if (profile.includes(':face-')) {
        const [baseId, faceStr] = profile.split(':face-');
        const faceIndex = parseInt(faceStr);

        if (!isNaN(faceIndex)) {
            const faceOpts: Record<string, any> = {};
            if (normalized.twistAngle) faceOpts.twistAngle = normalized.twistAngle;
            if (normalized.endFactor !== undefined && normalized.endFactor !== 1) {
                faceOpts.endFactor = normalized.endFactor;
            }

            const resultVar = codeManager.addFaceExtrusion(baseId, faceIndex, normalized.distance, faceOpts);

            if (normalized.operation !== 'new' && resultVar) {
                const methodMap: Record<string, string> = {
                    join: 'fuse',
                    cut: 'cut',
                    intersect: 'intersect',
                };
                const methodName = methodMap[normalized.operation];
                if (methodName) {
                    codeManager.addOperation(baseId, methodName, [{ type: 'raw', content: resultVar }]);
                }
            }
            return;
        }
    }

    const extrudeArgs: any[] = [normalized.distance];
    if (Object.keys(opts).length > 0) extrudeArgs.push(opts);
    codeManager.addOperation(profile, 'extrude', extrudeArgs);
}

export function inferFaceNormalAxis(
    profileValue: string,
    objects: CADObject[],
    currentAxis: unknown,
): Record<string, any> | void {
    if (!profileValue.includes(':face-') || currentAxis) return;

    const [baseId, faceSuffix] = profileValue.split(':face-');
    const obj = objects.find((item) => item.id === baseId);
    if (!obj?.geometry || !obj.faceMapping) return;

    const faceId = parseInt(faceSuffix);
    const mapping = obj.faceMapping.find((entry) => entry.faceId === faceId);
    if (!mapping || !obj.geometry.getAttribute('normal')) return;

    const normAttr = obj.geometry.getAttribute('normal');
    const avgNorm = new THREE.Vector3();

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

    const eps = 0.001;
    let axisValue: any = {
        type: 'raw',
        content: `[${avgNorm.x.toFixed(4)}, ${avgNorm.y.toFixed(4)}, ${avgNorm.z.toFixed(4)}]`,
    };

    if (Math.abs(avgNorm.x - 1) < eps && Math.abs(avgNorm.y) < eps && Math.abs(avgNorm.z) < eps) {
        axisValue = 'AXIS_X';
    } else if (Math.abs(avgNorm.x + 1) < eps && Math.abs(avgNorm.y) < eps && Math.abs(avgNorm.z) < eps) {
        axisValue = { type: 'raw', content: '[-1, 0, 0]' };
    } else if (Math.abs(avgNorm.y - 1) < eps && Math.abs(avgNorm.x) < eps && Math.abs(avgNorm.z) < eps) {
        axisValue = 'AXIS_Y';
    } else if (Math.abs(avgNorm.y + 1) < eps && Math.abs(avgNorm.x) < eps && Math.abs(avgNorm.z) < eps) {
        axisValue = { type: 'raw', content: '[0, -1, 0]' };
    } else if (Math.abs(avgNorm.z - 1) < eps && Math.abs(avgNorm.x) < eps && Math.abs(avgNorm.y) < eps) {
        axisValue = 'AXIS_Z';
    } else if (Math.abs(avgNorm.z + 1) < eps && Math.abs(avgNorm.x) < eps && Math.abs(avgNorm.y) < eps) {
        axisValue = { type: 'raw', content: '[0, 0, -1]' };
    }

    return { axis: axisValue };
}

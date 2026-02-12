import type { CADObject } from './types';
import type { SerializedSketch } from '@/lib/sketch';
import { deserializeSketch } from '@/lib/sketch';

export interface CADStateFixture {
    code?: string;
    fileName?: string;
    projectId?: string | null;
    objects?: CADObject[];
    selectedIds?: string[];
    activeTool?: string;
    activeTab?: string;
    sketchPlane?: 'XY' | 'XZ' | 'YZ' | null;
    isSketchMode?: boolean;
    activeSketchPrimitives?: any[];
    sketches?: SerializedSketch[];
    sketchesById?: Record<string, SerializedSketch>;
}

export interface HydratedPatch {
    code?: string;
    fileName?: string;
    projectId?: string | null;
    objects?: CADObject[];
    selectedIds?: Set<string>;
    activeTool?: string;
    activeTab?: string;
    sketchPlane?: 'XY' | 'XZ' | 'YZ' | null;
    isSketchMode?: boolean;
    activeSketchPrimitives?: any[];
    sketches?: Map<string, ReturnType<typeof deserializeSketch>>;
}

export function buildHydratedPatch(fixture: CADStateFixture): HydratedPatch {
    const patch: HydratedPatch = {};

    if (fixture.code !== undefined) patch.code = fixture.code;
    if (fixture.fileName !== undefined) patch.fileName = fixture.fileName;
    if (fixture.projectId !== undefined) patch.projectId = fixture.projectId;
    if (fixture.objects !== undefined) patch.objects = fixture.objects;
    if (fixture.activeTool !== undefined) patch.activeTool = fixture.activeTool;
    if (fixture.activeTab !== undefined) patch.activeTab = fixture.activeTab;
    if (fixture.sketchPlane !== undefined) patch.sketchPlane = fixture.sketchPlane;
    if (fixture.isSketchMode !== undefined) patch.isSketchMode = fixture.isSketchMode;
    if (fixture.activeSketchPrimitives !== undefined) {
        patch.activeSketchPrimitives = fixture.activeSketchPrimitives;
    }

    if (fixture.selectedIds) {
        patch.selectedIds = new Set(fixture.selectedIds);
    }

    const sketches = fixture.sketches
        ?? (fixture.sketchesById ? Object.values(fixture.sketchesById) : undefined);

    if (sketches) {
        patch.sketches = new Map(
            sketches.map((serialized) => {
                const sketch = deserializeSketch(serialized);
                return [serialized.id, sketch] as const;
            }),
        );
    }

    return patch;
}

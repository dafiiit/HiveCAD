import type { ProjectMeta, ProjectData, ProjectSnapshot, SerializedCADObject } from './types';

/** Default empty code for new projects */
export const DEFAULT_CODE = 'const main = () => {\n  return;\n};';

const DEFAULT_CODE_VARIANTS = [
    'const main = () => {\n  return;\n};',
    'const main = () => { return; };',
    'const main = () => {\n  return [];\n};',
    'const main = () => { return []; };',
];

/** Check if a project is empty (no meaningful code or geometry). */
export function isProjectEmpty(code = '', objects: any[] = []): boolean {
    const trimmed = (code || '').trim();
    const codeEmpty = DEFAULT_CODE_VARIANTS.some((v) => trimmed === v.trim());
    const hasGeometry = objects.length > 3; // axes take up 3 objects
    return codeEmpty && !hasGeometry;
}

/** Generate a UUID-v4 */
export function uuid(): string {
    return crypto.randomUUID?.() ?? Math.random().toString(36).substring(2, 11);
}

/** Create a blank ProjectMeta with sensible defaults. */
export function createBlankMeta(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
    const id = overrides.id ?? uuid();
    return {
        id,
        name: 'Untitled',
        ownerId: '',
        ownerEmail: '',
        description: '',
        visibility: 'private',
        tags: [],
        folder: '',
        thumbnail: '',
        lastModified: Date.now(),
        createdAt: Date.now(),
        remoteProvider: 'github',
        remoteLocator: '',
        lockedBy: null,
        ...overrides,
    };
}

/** Create a blank ProjectData. */
export function createBlankProject(overrides: Partial<ProjectMeta> = {}): ProjectData {
    return {
        meta: createBlankMeta(overrides),
        snapshot: { code: DEFAULT_CODE, objects: [] },
        namespaces: {},
    };
}

/** Strip THREE.js geometry from objects for serialization. */
export function serializeObjects(objects: any[]): SerializedCADObject[] {
    if (!objects) return [];
    return objects.map((obj) => {
        const { geometry, edgeGeometry, vertexGeometry, selected, ...rest } = obj;
        return JSON.parse(JSON.stringify(rest));
    });
}

/** Remove geometry fields without full JSON round-trip. */
export function cleanObjects(objects: any[]): any[] {
    if (!objects) return [];
    return objects.map((obj) => {
        if (!obj) return obj;
        const copy = { ...obj };
        delete copy.geometry;
        delete copy.edgeGeometry;
        delete copy.vertexGeometry;
        return copy;
    });
}

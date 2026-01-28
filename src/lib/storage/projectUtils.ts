export const DEFAULT_EMPTY_CODE_VARIANTS = [
    'const main = () => {\n  return;\n};',
    'const main = () => { return; };',
    'const main = () => {\n  return [];\n};',
    'const main = () => { return []; };',
];

/**
 * Check if a project is empty (no meaningful code or geometry)
 */
export function isProjectEmpty(code: string = '', objects: any[] = []): boolean {
    const trimmedCode = (code || '').trim();
    const codeEmpty = DEFAULT_EMPTY_CODE_VARIANTS.some(
        variant => trimmedCode === variant.trim()
    );

    // Check if objects exist and are more than just axes
    // Note: Usually there are 3 axis objects (X, Y, Z)
    const hasGeometry = objects.length > 3;

    return codeEmpty && !hasGeometry;
}

/**
 * Permanently delete a project from both cloud and local storage
 */
export async function deleteProjectPermanently(
    projectId: string,
    projectName: string,
    removeThumbnail?: (name: string) => void
): Promise<void> {
    const { StorageManager } = await import('./StorageManager');
    const adapter = StorageManager.getInstance().currentAdapter;

    // 1. Mark as Trash immediately in index (for immediate UI feedback)
    try {
        if (adapter.updateMetadata) {
            await adapter.updateMetadata(projectId, {
                deletedAt: Date.now(),
                tags: ['Trash']
            });
        }
    } catch (e) {
        console.warn(`[projectUtils] Failed to tag ${projectId} as Trash before deletion:`, e);
    }

    // 2. Mark as Trash in Local IndexedDB (to prevent flicker)
    try {
        const { get: idbGet, set: idbSet } = await import('idb-keyval');
        const project = await idbGet(`project:${projectId}`);
        if (project) {
            const trashedProject = {
                ...project,
                deletedAt: Date.now(),
                tags: [...(project.tags || []), 'Trash']
            };
            await idbSet(`project:${projectId}`, trashedProject);
        }
    } catch (e) {
        console.warn(`[projectUtils] Failed to mark as trash locally:`, e);
    }

    // 3. Delete from Cloud (GitHub + Supabase index + Thumbnails)
    try {
        if (adapter.permanentlyDelete) {
            await adapter.permanentlyDelete(projectId);
        } else {
            await adapter.delete(projectId);
        }
    } catch (error) {
        console.error(`[projectUtils] Cloud deletion failed for ${projectId}:`, error);
        throw error;
    }

    // 2. Delete from Local (IndexedDB)
    try {
        const { del: idbDel } = await import('idb-keyval');
        await idbDel(`project:${projectId}`);
        await idbDel(`project:${projectName}`);
    } catch (error) {
        console.warn(`[projectUtils] Local IndexedDB deletion failed for ${projectId}:`, error);
    }

    // 3. Delete thumbnail from local storage
    if (removeThumbnail) {
        removeThumbnail(projectName);
    } else {
        try {
            const currentThumbnails = JSON.parse(localStorage.getItem('hivecad_thumbnails') || '{}');
            if (currentThumbnails[projectName]) {
                delete currentThumbnails[projectName];
                localStorage.setItem('hivecad_thumbnails', JSON.stringify(currentThumbnails));
            }
        } catch (e) {
            console.warn("[projectUtils] Failed to clean up thumbnail from localStorage", e);
        }
    }

    console.log(`[projectUtils] Project ${projectId} (${projectName}) deleted permanently`);
}

import { keys, get, del } from 'idb-keyval';
import { ProjectData } from '@/lib/storage/types';

const MAX_CACHED_PROJECTS = 20;

export class CacheManager {
    static async pruneCache() {
        try {
            const allKeys = await keys();
            const projectKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('project:'));

            if (projectKeys.length <= MAX_CACHED_PROJECTS) return;

            // Fetch metadata (lastModified) for all projects
            // We use Promise.all but be careful with memory if projects are huge. 
            // todo:refine Store lightweight metadata separately to avoid loading full project data.
            // Ideally we'd store metadata separately, but for now we load them.
            const projectsWithMeta = await Promise.all(
                projectKeys.map(async (key) => {
                    const data = await get<ProjectData>(key);
                    return { key, lastModified: data?.lastModified || 0 };
                })
            );

            // Sort by lastModified descending (newest first)
            projectsWithMeta.sort((a, b) => b.lastModified - a.lastModified);

            // Identify keys to delete (keep top N)
            const keysToDelete = projectsWithMeta.slice(MAX_CACHED_PROJECTS).map(p => p.key);

            if (keysToDelete.length > 0) {
                await Promise.all(keysToDelete.map(key => del(key)));
                console.log(`[CacheManager] Pruned ${keysToDelete.length} old projects from local cache.`);
            }
        } catch (error) {
            console.error('[CacheManager] Failed to prune cache:', error);
        }
    }
}

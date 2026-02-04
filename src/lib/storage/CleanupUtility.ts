import { StorageManager } from './StorageManager';
import { isProjectEmpty } from './projectUtils';

export class CleanupUtility {
    private static isRunning = false;
    private static lastRun = 0;
    private static CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    /**
     * Check if project name is just an ID
     */
    private static hasIdAsName(project: any): boolean {
        const name = project.name || project.fileName || '';
        // Check if name matches ID pattern (9 alphanumeric chars)
        return /^[a-z0-9]{9}$/i.test(name) && name === project.id;
    }

    /**
     * Run cleanup in background (non-blocking)
     */
    static async runBackgroundCleanup(): Promise<void> {
        // Prevent multiple simultaneous cleanups
        if (this.isRunning) {
            console.log('[CleanupUtility] Cleanup already running, skipping');
            return;
        }

        // Check if we've run recently
        const now = Date.now();
        if (now - this.lastRun < this.CLEANUP_INTERVAL) {
            console.log('[CleanupUtility] Cleanup ran recently, skipping');
            return;
        }

        this.isRunning = true;
        this.lastRun = now;

        console.log('[CleanupUtility] Starting background cleanup...');

        try {
            const adapter = StorageManager.getInstance().currentAdapter;

            // Critical check: Skip if adapter is not authenticated
            if (adapter.isAuthenticated && !adapter.isAuthenticated()) {
                console.log('[CleanupUtility] Skipping cleanup: not authenticated');
                return;
            }

            if (!adapter.listProjects) {
                console.warn('[CleanupUtility] Adapter does not support listing projects');
                return;
            }

            const projects = await adapter.listProjects();
            console.log(`[CleanupUtility] Found ${projects.length} projects to scan`);

            let deletedCount = 0;
            let renamedCount = 0;

            for (const project of projects) {
                try {
                    const data = await adapter.load(project.id);

                    // Check if empty
                    const code = data.files?.code || data.code || '';
                    const objects = data.objects || [];
                    if (isProjectEmpty(code, objects)) {
                        console.log(`[CleanupUtility] Deleting empty project: ${project.id} (${project.name})`);
                        await adapter.delete(project.id);
                        deletedCount++;
                        continue;
                    }

                    // Check if name is just the ID
                    if (this.hasIdAsName(project)) {
                        const newName = `Unnamed Project ${project.id.substring(0, 6)}`;
                        console.log(`[CleanupUtility] Renaming ID-named project: ${project.id} -> ${newName}`);
                        await adapter.rename(project.id, newName);
                        renamedCount++;
                    }

                } catch (error) {
                    console.warn(`[CleanupUtility] Failed to process project ${project.id}:`, error);
                    // Continue with next project
                }
            }

            console.log(`[CleanupUtility] Cleanup complete: deleted ${deletedCount}, renamed ${renamedCount}`);

        } catch (error) {
            console.error('[CleanupUtility] Cleanup failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Force cleanup to run (ignores interval check)
     */
    static async forceCleanup(): Promise<{ deleted: number; renamed: number }> {
        this.lastRun = 0; // Reset timer
        await this.runBackgroundCleanup();
        // todo:refine Track deleted/renamed counts during cleanup instead of returning zeros.
        return { deleted: 0, renamed: 0 }; // Would need to track these but log is sufficient for now
    }
}

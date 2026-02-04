import { StorageAdapter, StorageType } from '../types';

export class PublicAdapter implements StorageAdapter {
    readonly type: StorageType = 'public';
    readonly name: string = 'HiveCAD Public';

    async connect(): Promise<boolean> {
        // Public adapter is always connected
        return true;
    }

    async disconnect(): Promise<void> {
        // Cannot disconnect from public adapter
        return;
    }

    isAuthenticated(): boolean {
        return true;
    }

    async save(projectId: string, data: any): Promise<void> {
        console.log(`[PublicAdapter] Saving project ${projectId} to HiveCAD Public...`);
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // todo:everything Replace localStorage mock with real public API persistence.
        // In a real app, this would POST to https://api.hivecad.com/projects
        localStorage.setItem(`hivecad_public_${projectId}`, JSON.stringify({
            ...data,
            lastModified: Date.now()
        }));

        console.log(`[PublicAdapter] Saved successfully.`);
    }

    async load(projectId: string, _owner?: string, _repo?: string): Promise<any> {
        console.log(`[PublicAdapter] Loading project ${projectId}...`);
        await new Promise(resolve => setTimeout(resolve, 500));

        const data = localStorage.getItem(`hivecad_public_${projectId}`);
        return data ? JSON.parse(data) : null;
    }

    async delete(projectId: string): Promise<void> {
        // Soft delete simulation
        const data = await this.load(projectId);
        if (data) {
            await this.updateMetadata(projectId, { deletedAt: Date.now() });
        }
    }

    async permanentlyDelete(projectId: string): Promise<void> {
        localStorage.removeItem(`hivecad_public_${projectId}`);
        localStorage.removeItem(`hivecad_public_thumb_${projectId}`);
    }

    async rename(projectId: string, newName: string): Promise<void> {
        const data = await this.load(projectId);
        if (data) {
            await this.save(projectId, { ...data, name: newName });
        }
    }

    async updateMetadata(projectId: string, updates: any): Promise<void> {
        const data = await this.load(projectId);
        if (data) {
            await this.save(projectId, { ...data, ...updates });
        }
    }

    async saveThumbnail(projectId: string, thumbnail: string): Promise<void> {
        localStorage.setItem(`hivecad_public_thumb_${projectId}`, thumbnail);
    }
}

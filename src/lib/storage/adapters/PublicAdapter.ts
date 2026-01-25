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
}

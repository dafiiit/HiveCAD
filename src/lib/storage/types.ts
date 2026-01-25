export type StorageType = 'public' | 'github' | 'drive';

export interface StorageConfig {
    type: StorageType;
    name: string;
    icon: string;
    isAuthenticated: boolean;
    token?: string; // For demo purposes, we'll store mock tokens here
}

export interface ProjectData {
    id: string;
    name: string;
    ownerId: string;
    files: any; // Using any for now to match current structure, refine later
    version: string;
    lastModified: number;
}

export interface StorageAdapter {
    readonly type: StorageType;
    readonly name: string;

    // Authentication
    connect(token?: string): Promise<boolean>;
    disconnect(): Promise<void>;
    isAuthenticated(): boolean;

    // Persistence
    save(projectId: string, data: any): Promise<void>;
    load(projectId: string, owner?: string, repo?: string): Promise<any>;

    // Discovery
    searchCommunityProjects?(query: string): Promise<any[]>;

    // Versioning (Optional / Future)
    listVersions?(projectId: string): Promise<any[]>;
}

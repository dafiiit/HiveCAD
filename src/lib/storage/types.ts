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
    name: string; // The "display name"
    ownerId: string;
    files: any;   // Using any for now to match current structure
    version: string;
    lastModified: number;
    tags?: string[];
    deletedAt?: number;
    sha?: string;
    lastOpenedAt?: number;
    thumbnail?: string;
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
    delete(projectId: string): Promise<void>;
    rename(projectId: string, newName: string): Promise<void>;
    updateMetadata(projectId: string, updates: Partial<Pick<ProjectData, 'tags' | 'deletedAt' | 'name' | 'lastOpenedAt'>>): Promise<void>;
    saveThumbnail(projectId: string, thumbnail: string): Promise<void>;

    // Discovery
    listProjects?(): Promise<ProjectData[]>;
    searchCommunityProjects?(query: string): Promise<any[]>;

    // Labels management
    listTags?(): Promise<Array<{ name: string, color: string }>>;
    saveTags?(tags: Array<{ name: string, color: string }>): Promise<void>;

    // Versioning (Optional / Future)
    listVersions?(projectId: string): Promise<any[]>;

    // Maintenance
    resetRepository?(): Promise<void>;
}

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
    folder?: string;
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
    load(projectId: string, owner?: string, repo?: string, ref?: string): Promise<any>;
    delete(projectId: string): Promise<void>;
    rename(projectId: string, newName: string): Promise<void>;
    updateMetadata(projectId: string, updates: Partial<Pick<ProjectData, 'tags' | 'deletedAt' | 'name' | 'lastOpenedAt' | 'folder'>>): Promise<void>;
    saveThumbnail(projectId: string, thumbnail: string): Promise<void>;

    // History and Branching (Optional, mostly for GitHub adapter)
    getHistory?(projectId: string): Promise<CommitInfo[]>;
    createBranch?(projectId: string, sourceSha: string, branchName: string): Promise<void>;
    getBranches?(projectId: string): Promise<BranchInfo[]>;
    switchBranch?(branchName: string): Promise<void>;
    getCurrentBranch?(): Promise<string>;

    // Discovery
    listProjects?(): Promise<ProjectData[]>;
    searchCommunityProjects?(query: string): Promise<any[]>;

    // Labels management
    listTags?(): Promise<Array<{ name: string, color: string }>>;
    saveTags?(tags: Array<{ name: string, color: string }>): Promise<void>;

    // Folder management
    listFolders?(): Promise<Array<{ name: string, color: string }>>;
    saveFolders?(folders: Array<{ name: string, color: string }>): Promise<void>;

    // Versioning (Optional / Future)
    listVersions?(projectId: string): Promise<any[]>;

    // Maintenance
    resetRepository?(): Promise<void>;
}

export interface CommitInfo {
    hash: string;
    parents: string[];
    author: {
        name: string;
        email?: string;
        date: string;
    };
    subject: string;
    body?: string;
    refNames?: string[]; // e.g. ["HEAD", "main", "origin/main"]
}

export interface BranchInfo {
    name: string;
    sha: string;
    isCurrent: boolean;
}

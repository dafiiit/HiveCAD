export type StorageType = 'public' | 'github' | 'local';

export interface StorageConfig {
    type: StorageType;
    name: string;
    icon: string;
    isAuthenticated: boolean;
    // todo:refine Replace mock token handling with a secure auth/session model.
    token?: string; // For demo purposes, we'll store mock tokens here
}

export interface ProjectNamespaceData {
    [key: string]: any;
}

export interface ExtensionStats {
    downloads: number;
    likes: number;
    dislikes: number;
}

export interface ExtensionManifest {
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    icon: string;
}

export interface Extension {
    id: string;
    github_owner: string;
    github_repo: string;
    author: string;
    status: 'development' | 'published';
    stats: ExtensionStats;
    // Metadata from manifest.json (loaded separately)
    manifest?: ExtensionManifest;
}

export interface ProjectData {
    id: string;
    name: string; // The "display name"
    ownerId: string;
    files?: any;   // Optional in new structure, legacy fallback
    cad?: {
        code: string;
        objects: any[];
    };
    namespaces?: Record<string, ProjectNamespaceData>;
    version: string;
    lastModified: number;
    tags?: string[];
    deletedAt?: number;
    sha?: string;
    lastOpenedAt?: number;
    thumbnail?: string;
    folder?: string;
    description?: string;
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
    searchCommunityExtensions?(query: string): Promise<Extension[]>;
    submitExtension?(extension: Partial<Extension>): Promise<string>; // Returns GitHub URL
    updateExtensionStatus?(extensionId: string, status: 'development' | 'published'): Promise<void>;
    voteExtension?(extensionId: string, voteType: 'like' | 'dislike'): Promise<void>;
    incrementExtensionDownloads?(extensionId: string): Promise<void>;
    updateIndex?(projectId: string, updates: Partial<ProjectData>, isDelete?: boolean): Promise<void>;

    // Labels management
    listTags?(): Promise<Array<{ name: string, color: string }>>;
    saveTags?(tags: Array<{ name: string, color: string }>): Promise<void>;

    // Folder management
    listFolders?(): Promise<Array<{ name: string, color: string }>>;
    saveFolders?(folders: Array<{ name: string, color: string }>): Promise<void>;

    // Versioning (Optional / Future)
    listVersions?(projectId: string): Promise<any[]>;

    // Maintenance
    permanentlyDelete?(projectId: string): Promise<void>;
    resetRepository?(): Promise<void>;

    // Feedback
    createIssue?(title: string, body: string): Promise<void>;

    // User Settings persistence
    saveUserSettings?(data: any): Promise<void>;
    loadUserSettings?(): Promise<any>;
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

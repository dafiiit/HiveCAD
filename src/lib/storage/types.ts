/**
 * Storage Types — Core domain types for the entire storage layer.
 *
 * Architecture overview:
 *
 *   ┌─────────────┐     ┌───────────────┐
 *   │  QuickStore  │────▶│  RemoteStore   │   (background sync)
 *   │ (local git / │     │  (GitHub /     │
 *   │  in-mem git) │     │   GitLab / …)  │
 *   └─────────────┘     └───────────────┘
 *          │                     │
 *          └──────┬──────────────┘
 *                 ▼
 *          ┌──────────────┐
 *          │   Supabase   │  (metadata index, social, discovery)
 *          └──────────────┘
 *
 * QuickStore  – instant, synchronous-feeling reads/writes.
 *               Offline (Desktop) → local git (Tauri filesystem).
 *               Online  (Web)     → in-memory git (RAM, backed by IndexedDB).
 *
 * RemoteStore – durable, shareable backup.
 *               Currently GitHub. Designed so GitLab etc. can be added.
 *
 * Supabase    – project/extension metadata, social (votes, comments),
 *               discovery, and the *link* to the remote storage.
 */

// ─── Identifiers ───────────────────────────────────────────────────────────

/** UUID v4 string */
export type ProjectId = string;
/** UUID v4 string */
export type UserId = string;
/** Short commit hash */
export type CommitHash = string;

// ─── Project ───────────────────────────────────────────────────────────────

export type ProjectVisibility = 'public' | 'private';

export interface ProjectSnapshot {
    code: string;
    objects: SerializedCADObject[];
}

/**
 * Minimal serializable CAD object (no THREE.js geometry).
 */
export interface SerializedCADObject {
    id: string;
    name: string;
    type: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    dimensions: Record<string, any>;
    color: string;
    visible: boolean;
    extensionData?: Record<string, Record<string, any>>;
}

/**
 * Lightweight project metadata — used for listing/search/dashboard.
 * Does NOT contain the full project data (code, objects, etc.).
 */
export interface ProjectMeta {
    id: ProjectId;
    name: string;
    ownerId: UserId;
    ownerEmail: string;
    description: string;
    visibility: ProjectVisibility;
    tags: string[];
    folder: string;
    thumbnail: string;
    lastModified: number;
    createdAt: number;
    /** Remote storage provider key, e.g. 'github' */
    remoteProvider: string;
    /** Owner/repo or equivalent locator on the remote */
    remoteLocator: string;
    /** Lock: if non-null, this user has an exclusive edit lock */
    lockedBy: UserId | null;
}

/**
 * Full project data — the complete state needed to open/edit a project.
 */
export interface ProjectData {
    meta: ProjectMeta;
    snapshot: ProjectSnapshot;
    /** Extension namespace data */
    namespaces: Record<string, Record<string, any>>;
}

// ─── Commits / VCS ─────────────────────────────────────────────────────────

export interface CommitInfo {
    hash: CommitHash;
    parents: CommitHash[];
    author: { name: string; email?: string; date: string };
    message: string;
    refNames?: string[];
}

export interface BranchInfo {
    name: string;
    sha: CommitHash;
    isCurrent: boolean;
}

// ─── Extensions ────────────────────────────────────────────────────────────

export interface ExtensionManifest {
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    icon: string;
    category?: string;
}

export interface ExtensionStats {
    downloads: number;
    likes: number;
    dislikes: number;
}

export interface ExtensionEntry {
    id: string;
    manifest: ExtensionManifest;
    stats: ExtensionStats;
    status: 'development' | 'published';
    remoteProvider: string;
    remoteOwner: string;
    remoteRepo: string;
    authorId: UserId;
    authorEmail: string;
}

// ─── Tags / Folders ────────────────────────────────────────────────────────

export interface TagEntry { name: string; color: string }
export interface FolderEntry { name: string; color: string }

// ─── Quick Store SPI ───────────────────────────────────────────────────────

/**
 * QuickStore — fast, local-feeling storage layer.
 *
 * Desktop: backed by the local filesystem + git (Tauri).
 * Web:     backed by IndexedDB (in-memory git DAG).
 *
 * Every write emits a change event so the UI reacts instantly.
 */
export interface QuickStore {
    init(): Promise<void>;

    // Projects CRUD
    saveProject(data: ProjectData): Promise<void>;
    loadProject(id: ProjectId): Promise<ProjectData | null>;
    deleteProject(id: ProjectId): Promise<void>;
    listProjects(): Promise<ProjectMeta[]>;

    // Commits (local VCS)
    commit(id: ProjectId, message: string, author: string): Promise<CommitHash>;
    getHistory(id: ProjectId): Promise<CommitInfo[]>;
    getBranches(id: ProjectId): Promise<BranchInfo[]>;
    createBranch(id: ProjectId, name: string, fromHash: CommitHash): Promise<void>;
    switchBranch(id: ProjectId, name: string): Promise<void>;

    // Change listener — fires on every write
    onChange(listener: () => void): () => void;
}

// ─── Remote Store SPI ──────────────────────────────────────────────────────

/**
 * RemoteStore — durable cloud backup.
 *
 * Currently: GitHub REST API.
 * Future:    GitLab, Bitbucket, self-hosted, …
 */
export interface RemoteStore {
    readonly providerKey: string;   // 'github' | 'gitlab' | …
    readonly providerName: string;  // 'GitHub' | 'GitLab' | …

    connect(token: string): Promise<boolean>;
    disconnect(): Promise<void>;
    isConnected(): boolean;

    pushProject(data: ProjectData): Promise<void>;
    pullProject(id: ProjectId): Promise<ProjectData | null>;
    pullAllProjectMetas(): Promise<ProjectMeta[]>;
    deleteProject(id: ProjectId): Promise<void>;

    pushThumbnail(id: ProjectId, base64: string): Promise<void>;
    pullThumbnail(id: ProjectId): Promise<string | null>;

    getHistory(id: ProjectId): Promise<CommitInfo[]>;
    getBranches(id: ProjectId): Promise<BranchInfo[]>;
    createBranch(id: ProjectId, name: string, fromSha: CommitHash): Promise<void>;

    submitExtension(ext: Partial<ExtensionEntry>): Promise<string>;

    pushUserSettings(data: any): Promise<void>;
    pullUserSettings(): Promise<any>;

    resetRepository(): Promise<void>;
    createIssue(title: string, body: string): Promise<void>;
}

// ─── Supabase Metadata SPI ─────────────────────────────────────────────────

/**
 * SupabaseMeta — centralized metadata/discovery layer.
 *
 * Stores: project metadata index, extension catalog, social data,
 *         and *links* to storage providers. No file content here.
 */
export interface SupabaseMeta {
    upsertProjectMeta(meta: ProjectMeta): Promise<void>;
    deleteProjectMeta(id: ProjectId): Promise<void>;
    getProjectMeta(id: ProjectId): Promise<ProjectMeta | null>;
    listOwnProjects(userId: UserId): Promise<ProjectMeta[]>;
    searchPublicProjects(query: string): Promise<ProjectMeta[]>;
    setProjectVisibility(id: ProjectId, visibility: ProjectVisibility): Promise<void>;
    lockProject(id: ProjectId, userId: UserId): Promise<boolean>;
    unlockProject(id: ProjectId): Promise<void>;

    upsertExtension(ext: ExtensionEntry): Promise<void>;
    deleteExtension(id: string): Promise<void>;
    searchExtensions(query: string, includeOwn?: UserId): Promise<ExtensionEntry[]>;
    setExtensionStatus(id: string, status: 'development' | 'published'): Promise<void>;
    voteExtension(id: string, userId: UserId, voteType: 'like' | 'dislike'): Promise<void>;
    incrementDownloads(id: string): Promise<void>;

    getUserTags(userId: UserId): Promise<TagEntry[]>;
    saveUserTags(userId: UserId, tags: TagEntry[]): Promise<void>;
    getUserFolders(userId: UserId): Promise<FolderEntry[]>;
    saveUserFolders(userId: UserId, folders: FolderEntry[]): Promise<void>;

    resetAllUserData(userId: UserId): Promise<void>;
}

// ─── Sync Engine ───────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncState {
    status: SyncStatus;
    lastSyncTime: number | null;
    hasPendingChanges: boolean;
    lastError: string | null;
    /** True if closing the tab RIGHT NOW would lose data (web only) */
    wouldLoseData: boolean;
}

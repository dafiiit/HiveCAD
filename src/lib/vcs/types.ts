/**
 * VCS types — lightweight types for the visual commit graph.
 * 
 * These are the "display" commit shapes consumed by VCSGraph.
 * The actual storage uses CommitInfo from @/lib/storage/types.
 */

export interface Commit {
    id: string;
    parentId: string | null;
    message: string;
    author: string;
    timestamp: number;
    branchName: string;
}

/** @deprecated Use CommitInfo from @/lib/storage/types instead */
export interface Repository {
    commits: Map<string, Commit>;
    branches: Map<string, string>;
    currentBranch: string;
    head: string | null;
}

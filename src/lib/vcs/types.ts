import { CADObject } from '../../store/types';

/**
 * A Snapshot represents the state of a project at a specific point in time.
 * It contains the essential data needed to restore the "Working Tree".
 */
export interface Snapshot {
    code: string;
    objects: CADObject[];
}

/**
 * A Commit is a node in the DAG.
 * It is immutable once created.
 */
export interface Commit {
    id: string;
    parentId: string | null;
    snapshot?: Snapshot;
    message: string;
    author: string;
    timestamp: number;
    branchName: string; // The branch this commit was created on
}

/**
 * A Branch is a named pointer to a specific Commit ID.
 */
export type Branch = string; // Commit ID

/**
 * The Repository represents the entire state of the Version Control System.
 */
export interface Repository {
    commits: Map<string, Commit>;
    branches: Map<string, Branch>;
    head: string; // Current branch name or DETACHED commit ID
}

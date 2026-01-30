import { Repository, Commit, Snapshot, Branch } from './types';

export class VCSEngine {
    private repo: Repository;

    constructor() {
        this.repo = {
            commits: new Map(),
            branches: new Map(),
            head: 'main'
        };
    }

    /**
     * Initializes the repository with an initial commit on the 'main' branch.
     */
    public init(initialSnapshot: Snapshot): void {
        const initialCommit: Commit = {
            id: this.generateId(),
            parentId: null,
            snapshot: initialSnapshot,
            message: 'Initial Commit',
            author: 'HiveCAD',
            timestamp: Date.now(),
            branchName: 'main'
        };

        this.repo.commits.set(initialCommit.id, initialCommit);
        this.repo.branches.set('main', initialCommit.id);
        this.repo.head = 'main';
    }

    /**
     * Creates a new commit from the current working state.
     */
    public commit(snapshot: Snapshot, message: string, author: string = 'User'): string | null {
        const parentId = this.getCurrentCommitId();
        if (!parentId) return null;

        const newCommit: Commit = {
            id: this.generateId(),
            parentId: parentId,
            snapshot: snapshot,
            message: message,
            author: author,
            timestamp: Date.now(),
            branchName: this.repo.head // Use the current branch name
        };

        this.repo.commits.set(newCommit.id, newCommit);

        // Move the current branch pointer forward
        if (this.repo.branches.has(this.repo.head)) {
            this.repo.branches.set(this.repo.head, newCommit.id);
        } else {
            // Detached HEAD
            this.repo.head = newCommit.id;
        }

        return newCommit.id;
    }

    /**
     * Creates a new branch pointing to the current commit.
     */
    public createBranch(branchName: string): void {
        if (this.repo.branches.has(branchName)) {
            throw new Error(`Branch "${branchName}" already exists.`);
        }

        const currentCommitId = this.getCurrentCommitId();
        if (!currentCommitId) throw new Error('Cannot create branch: No current commit.');

        this.repo.branches.set(branchName, currentCommitId);
    }

    /**
     * Switches to a specific branch or commit.
     */
    public checkout(target: string): Snapshot {
        // Check if target is a branch name
        if (this.repo.branches.has(target)) {
            const commitId = this.repo.branches.get(target)!;
            const commit = this.repo.commits.get(commitId);
            if (!commit) throw new Error(`Commit ${commitId} for branch ${target} not found.`);
            this.repo.head = target;
            return commit.snapshot;
        }

        // Check if target is a commit ID
        const commit = this.repo.commits.get(target);
        if (commit) {
            this.repo.head = target; // Detached HEAD
            return commit.snapshot;
        }

        throw new Error(`Target "${target}" not found.`);
    }

    /**
     * Returns the full repository history (all commits in all branches).
     */
    public getFullHistory(): Commit[] {
        return Array.from(this.repo.commits.values()).sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Returns the full history of the current branch/commit.
     */
    public getHistory(): Commit[] {
        const history: Commit[] = [];
        let currentId = this.getCurrentCommitId();

        while (currentId) {
            const commit = this.repo.commits.get(currentId);
            if (!commit) break;
            history.push(commit);
            currentId = commit.parentId;
        }

        return history;
    }

    /**
     * Returns the state of the repository.
     */
    public getRepoState(): Repository {
        return {
            ...this.repo,
            commits: new Map(this.repo.commits),
            branches: new Map(this.repo.branches)
        };
    }

    /**
     * Hydrates the engine with existing state (e.g., from storage).
     */
    public hydrate(state: any): void {
        const commits = Array.isArray(state.commits)
            ? new Map(state.commits)
            : (state.commits instanceof Map ? state.commits : new Map(Object.entries(state.commits || {})));

        const branches = Array.isArray(state.branches)
            ? new Map(state.branches)
            : (state.branches instanceof Map ? state.branches : new Map(Object.entries(state.branches || {})));

        this.repo = {
            commits,
            branches,
            head: state.head || 'main'
        };
    }

    private getCurrentCommitId(): string | null {
        if (this.repo.branches.has(this.repo.head)) {
            return this.repo.branches.get(this.repo.head) || null;
        }
        // If head is not a branch name, it must be a commit ID (detached)
        return this.repo.head || null;
    }

    private generateId(): string {
        return Math.random().toString(36).substring(2, 9);
    }
}

import { Octokit } from 'octokit';

/**
 * Safely encode UTF-8 strings to base64.
 */
export function utf8ToBase64(str: string): string {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
    return btoa(binString);
}

/**
 * Simple string hash (32-bit, base-36 encoded).
 */
export function hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
}

/**
 * Retry an operation with exponential backoff on 409 Conflict errors.
 */
export async function retryOperation<T>(
    operation: () => Promise<T>,
    onConflict: () => Promise<void>,
    maxRetries = 3
): Promise<T> {
    let lastError: any;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            if (error.status === 409 || (error.message && error.message.includes('does not match'))) {
                console.warn(`[GitHubAdapter] Conflict detected (attempt ${i + 1}/${maxRetries}). Retrying...`);
                await onConflict();
                const delay = 500 * Math.pow(2, i) + Math.random() * 500;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

/**
 * Atomically commit multiple files to a branch using the Git tree API.
 */
export async function commitTree(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string,
    message: string,
    files: Array<{ path: string; content: string }>
): Promise<void> {
    await retryOperation(
        async () => {
            const { data: refData } = await octokit.rest.git.getRef({
                owner,
                repo,
                ref: `heads/${branch}`,
            });
            const latestCommitSha = refData.object.sha;

            const { data: commitData } = await octokit.rest.git.getCommit({
                owner,
                repo,
                commit_sha: latestCommitSha,
            });
            const baseTreeSha = commitData.tree.sha;

            const tree = files.map(file => ({
                path: file.path,
                mode: '100644' as const,
                type: 'blob' as const,
                content: file.content,
            }));

            const { data: newTreeData } = await octokit.rest.git.createTree({
                owner,
                repo,
                base_tree: baseTreeSha,
                tree,
            });

            const { data: newCommitData } = await octokit.rest.git.createCommit({
                owner,
                repo,
                message,
                tree: newTreeData.sha,
                parents: [latestCommitSha],
            });

            await octokit.rest.git.updateRef({
                owner,
                repo,
                ref: `heads/${branch}`,
                sha: newCommitData.sha,
                force: false,
            });
        },
        async () => {
            // No specific state to reset for git operations as we re-fetch everything from HEAD
        }
    );
}

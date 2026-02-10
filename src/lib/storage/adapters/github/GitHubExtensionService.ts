import { Octokit } from 'octokit';
import { supabase } from '../../../auth/supabase';
import { utf8ToBase64, retryOperation } from './GitHubHelpers';

/**
 * Handles community extension marketplace operations for the GitHubAdapter.
 */
export class GitHubExtensionService {
    constructor(
        private getOctokit: () => Octokit | null,
        private getOwner: () => string | null,
        private getRepo: () => string | null,
        private getBranch: () => string
    ) { }

    async searchCommunityExtensions(query: string): Promise<any[]> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const currentUserEmail = session?.user?.email || null;

            console.log('[GitHubAdapter] searchCommunityExtensions called');
            console.log('[GitHubAdapter] Current user email:', currentUserEmail);
            console.log('[GitHubAdapter] Search query:', query);

            let supabaseQuery = supabase
                .from('extensions')
                .select('*');

            if (currentUserEmail) {
                supabaseQuery = supabaseQuery.or(`status.eq.published,author.eq.${currentUserEmail}`);
            } else {
                supabaseQuery = supabaseQuery.eq('status', 'published');
            }

            const { data, error } = await supabaseQuery;

            if (error) throw error;

            console.log(`[GitHubAdapter] Found ${data.length} extension(s) in Supabase`);
            data.forEach(item => {
                console.log(`  - ${item.id} (author: ${item.author}, status: ${item.status}, repo: ${item.github_owner}/${item.github_repo})`);
            });

            const octokit = this.getOctokit();
            if (!octokit) {
                console.warn('[GitHubAdapter] Not authenticated, cannot fetch manifests');
                return [];
            }

            const extensionsWithManifests = await Promise.all(
                data.map(async (item) => {
                    try {
                        const isCurrentRepo = this.getOwner() && this.getRepo() &&
                            item.github_owner === this.getOwner() &&
                            item.github_repo === this.getRepo();

                        const ref = isCurrentRepo ? this.getBranch() : undefined;

                        const { data: manifestFileData } = await octokit.rest.repos.getContent({
                            owner: item.github_owner,
                            repo: item.github_repo,
                            path: `extensions/${item.id}/manifest.json`,
                            ref,
                        });

                        if ('content' in manifestFileData) {
                            const manifestContent = atob(manifestFileData.content);
                            const manifest = JSON.parse(manifestContent);

                            if (query && !manifest.name.toLowerCase().includes(query.toLowerCase()) &&
                                !manifest.description.toLowerCase().includes(query.toLowerCase())) {
                                return null;
                            }

                            return {
                                id: item.id,
                                github_owner: item.github_owner,
                                github_repo: item.github_repo,
                                author: item.author,
                                status: item.status,
                                stats: {
                                    downloads: item.downloads || 0,
                                    likes: item.likes || 0,
                                    dislikes: item.dislikes || 0,
                                },
                                manifest,
                            };
                        }
                    } catch (error: any) {
                        console.warn(`[GitHubAdapter] Failed to load manifest for ${item.id}:`, error.message);
                        return {
                            id: item.id,
                            github_owner: item.github_owner,
                            github_repo: item.github_repo,
                            author: item.author,
                            status: item.status,
                            stats: {
                                downloads: item.downloads || 0,
                                likes: item.likes || 0,
                                dislikes: item.dislikes || 0,
                            },
                            manifest: {
                                id: item.id,
                                name: `${item.id} (Load Failed)`,
                                description: `Failed to load manifest from ${item.github_owner}/${item.github_repo}. The extension files may be missing or on a different branch.`,
                                author: item.author,
                                version: '0.0.0',
                                icon: 'alert-circle',
                            },
                        };
                    }
                    return null;
                })
            );

            return extensionsWithManifests.filter(ext => ext !== null);
        } catch (error) {
            console.error('[GitHubAdapter] Failed to search Supabase extensions:', error);
            return [];
        }
    }

    async submitExtension(extension: any): Promise<string> {
        const octokit = this.getOctokit();
        const owner = this.getOwner();
        const repo = this.getRepo();
        if (!octokit || !owner || !repo) {
            throw new Error('Not authenticated with GitHub');
        }

        const extensionId = extension.id;

        console.log(`[GitHubAdapter] Creating extension folder for ${extensionId}...`);

        const manifest = {
            id: extensionId,
            name: extension.name,
            description: extension.description,
            author: extension.author,
            version: extension.version || '1.0.0',
            icon: extension.icon,
        };

        const readme = `# ${extension.name}\n\n${extension.description}\n\n## Installation\nThis extension is part of the HiveCAD community library.\n\n## Usage\n[Add usage instructions here]\n\n## Author\n${extension.author}\n\n## Version\n${extension.version || '1.0.0'}\n`;

        const indexTs = `// ${extension.name}\n// ${extension.description}\n\nimport { Extension } from '@/lib/extensions/Extension';\n\nexport const extension: Extension = {\n    manifest: {\n        id: '${extensionId}',\n        name: '${extension.name}',\n        version: '${extension.version || '1.0.0'}',\n        description: '${extension.description}',\n        author: '${extension.author}',\n        icon: '${extension.icon}',\n        category: 'modifier',\n    },\n    onRegister: () => {\n        console.log('${extension.name} registered');\n    },\n};\n`;

        const guideResponse = await fetch('/src/extensions/EXTENSION_GUIDE.md');
        const guideContent = await guideResponse.text();

        try {
            const files = [
                {
                    path: `extensions/${extensionId}/manifest.json`,
                    content: utf8ToBase64(JSON.stringify(manifest, null, 2)),
                    message: `Create manifest for ${extension.name}`,
                },
                {
                    path: `extensions/${extensionId}/README.md`,
                    content: utf8ToBase64(readme),
                    message: `Create README for ${extension.name}`,
                },
                {
                    path: `extensions/${extensionId}/index.ts`,
                    content: utf8ToBase64(indexTs),
                    message: `Create template for ${extension.name}`,
                },
                {
                    path: `extensions/${extensionId}/EXTENSION_GUIDE.md`,
                    content: utf8ToBase64(guideContent),
                    message: `Add development guide for ${extension.name}`,
                },
            ];

            for (const file of files) {
                await octokit.rest.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: file.path,
                    message: file.message,
                    content: file.content,
                    branch: this.getBranch(),
                });
            }

            const { error } = await supabase
                .from('extensions')
                .upsert({
                    id: extensionId,
                    github_owner: owner,
                    github_repo: repo,
                    author: extension.author,
                    status: 'development',
                    updated_at: new Date().toISOString(),
                });

            if (error) throw error;

            console.log(`[GitHubAdapter] Extension ${extension.name} created successfully`);

            return `https://github.com/${owner}/${repo}/tree/${this.getBranch()}/extensions/${extensionId}`;

        } catch (error) {
            console.error('[GitHubAdapter] Failed to create extension:', error);
            throw error;
        }
    }

    async updateExtensionStatus(extensionId: string, status: 'development' | 'published'): Promise<void> {
        try {
            const { error } = await supabase
                .from('extensions')
                .update({ status, updated_at: new Date().toISOString() })
                .eq('id', extensionId);

            if (error) throw error;
            console.log(`[GitHubAdapter] Extension ${extensionId} status updated to ${status}`);
        } catch (error) {
            console.error('[GitHubAdapter] Failed to update extension status:', error);
            throw error;
        }
    }

    async voteExtension(extensionId: string, voteType: 'like' | 'dislike'): Promise<void> {
        try {
            const { data: extension, error: fetchError } = await supabase
                .from('extensions')
                .select('likes, dislikes')
                .eq('id', extensionId)
                .single();

            if (fetchError) throw fetchError;

            const updates = voteType === 'like'
                ? { likes: (extension.likes || 0) + 1 }
                : { dislikes: (extension.dislikes || 0) + 1 };

            const { error: updateError } = await supabase
                .from('extensions')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', extensionId);

            if (updateError) throw updateError;
            console.log(`[GitHubAdapter] Extension ${extensionId} ${voteType}d`);
        } catch (error) {
            console.error(`[GitHubAdapter] Failed to ${voteType} extension:`, error);
            throw error;
        }
    }

    async incrementExtensionDownloads(extensionId: string): Promise<void> {
        try {
            const { data: extension, error: fetchError } = await supabase
                .from('extensions')
                .select('downloads')
                .eq('id', extensionId)
                .single();

            if (fetchError) throw fetchError;

            const { error: updateError } = await supabase
                .from('extensions')
                .update({
                    downloads: (extension.downloads || 0) + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', extensionId);

            if (updateError) throw updateError;
            console.log(`[GitHubAdapter] Extension ${extensionId} download count incremented`);
        } catch (error) {
            console.error('[GitHubAdapter] Failed to increment downloads:', error);
            throw error;
        }
    }
}

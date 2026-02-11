/**
 * SupabaseMetaService — implements the SupabaseMeta interface.
 *
 * This is the centralized metadata/discovery layer.
 * It stores project metadata, extension catalog, social data,
 * and links to the actual storage providers.
 *
 * Supabase tables needed (see SUPABASE_SCHEMA.sql):
 *   projects       – project metadata + link to remote storage
 *   extensions     – extension catalog
 *   extension_votes – per-user voting (dedup)
 *   user_tags      – per-user tag config
 *   user_folders   – per-user folder config
 */

import { supabase } from '../../auth/supabase';
import type {
    SupabaseMeta, ProjectMeta, ProjectId, ProjectVisibility,
    UserId, ExtensionEntry, TagEntry, FolderEntry,
} from '../types';

export class SupabaseMetaService implements SupabaseMeta {

    // ─── Projects ───────────────────────────────────────────────────────────

    async upsertProjectMeta(meta: ProjectMeta): Promise<void> {
        const row = metaToRow(meta);
        const { error } = await supabase.from('projects').upsert(row, { onConflict: 'id' });
        if (error) throw error;
    }

    async deleteProjectMeta(id: ProjectId): Promise<void> {
        const { error } = await supabase.from('projects').delete().eq('id', id);
        if (error) throw error;
    }

    async getProjectMeta(id: ProjectId): Promise<ProjectMeta | null> {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data ? rowToMeta(data) : null;
    }

    async listOwnProjects(userId: UserId): Promise<ProjectMeta[]> {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('owner_id', userId)
            .order('last_modified', { ascending: false });
        if (error) throw error;
        return (data ?? []).map(rowToMeta);
    }

    async searchPublicProjects(query: string): Promise<ProjectMeta[]> {
        let q = supabase
            .from('projects')
            .select('*')
            .eq('visibility', 'public');

        if (query) {
            q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
        }

        const { data, error } = await q.order('last_modified', { ascending: false }).limit(50);
        if (error) throw error;
        return (data ?? []).map(rowToMeta);
    }

    async setProjectVisibility(id: ProjectId, visibility: ProjectVisibility): Promise<void> {
        const { error } = await supabase
            .from('projects')
            .update({ visibility, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    }

    async lockProject(id: ProjectId, userId: UserId): Promise<boolean> {
        // Optimistic lock: only succeeds if locked_by is null
        const { data, error } = await supabase
            .from('projects')
            .update({ locked_by: userId })
            .eq('id', id)
            .is('locked_by', null)
            .select('id')
            .maybeSingle();
        if (error) throw error;
        return data !== null;
    }

    async unlockProject(id: ProjectId): Promise<void> {
        const { error } = await supabase
            .from('projects')
            .update({ locked_by: null })
            .eq('id', id);
        if (error) throw error;
    }

    // ─── Extensions ─────────────────────────────────────────────────────────

    async upsertExtension(ext: ExtensionEntry): Promise<void> {
        const { error } = await supabase.from('extensions').upsert({
            id: ext.id,
            name: ext.manifest.name,
            description: ext.manifest.description,
            icon: ext.manifest.icon,
            version: ext.manifest.version,
            category: ext.manifest.category ?? 'general',
            author_id: ext.authorId,
            author_email: ext.authorEmail,
            status: ext.status,
            remote_provider: ext.remoteProvider,
            remote_owner: ext.remoteOwner,
            remote_repo: ext.remoteRepo,
            downloads: ext.stats.downloads,
            likes: ext.stats.likes,
            dislikes: ext.stats.dislikes,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (error) throw error;
    }

    async deleteExtension(id: string): Promise<void> {
        const { error } = await supabase.from('extensions').delete().eq('id', id);
        if (error) throw error;
    }

    async searchExtensions(query: string, includeOwn?: UserId): Promise<ExtensionEntry[]> {
        let q = supabase.from('extensions').select('*');

        if (includeOwn) {
            q = q.or(`status.eq.published,author_id.eq.${includeOwn}`);
        } else {
            q = q.eq('status', 'published');
        }

        if (query) {
            q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
        }

        const { data, error } = await q.order('downloads', { ascending: false }).limit(50);
        if (error) throw error;
        return (data ?? []).map(rowToExtension);
    }

    async setExtensionStatus(id: string, status: 'development' | 'published'): Promise<void> {
        const { error } = await supabase
            .from('extensions')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;
    }

    async voteExtension(id: string, userId: UserId, voteType: 'like' | 'dislike'): Promise<void> {
        // Upsert into extension_votes (one vote per user per extension)
        const { error: voteError } = await supabase.from('extension_votes').upsert({
            extension_id: id,
            user_id: userId,
            vote_type: voteType,
        }, { onConflict: 'extension_id,user_id' });
        if (voteError) throw voteError;

        // Recompute counts
        const { count: likes } = await supabase
            .from('extension_votes')
            .select('*', { count: 'exact', head: true })
            .eq('extension_id', id)
            .eq('vote_type', 'like');

        const { count: dislikes } = await supabase
            .from('extension_votes')
            .select('*', { count: 'exact', head: true })
            .eq('extension_id', id)
            .eq('vote_type', 'dislike');

        await supabase.from('extensions').update({
            likes: likes ?? 0,
            dislikes: dislikes ?? 0,
        }).eq('id', id);
    }

    async incrementDownloads(id: string): Promise<void> {
        // Use Supabase RPC or raw increment
        const { data } = await supabase
            .from('extensions')
            .select('downloads')
            .eq('id', id)
            .single();
        if (data) {
            await supabase.from('extensions').update({
                downloads: (data.downloads ?? 0) + 1,
            }).eq('id', id);
        }
    }

    // ─── Tags / Folders ─────────────────────────────────────────────────────

    async getUserTags(userId: UserId): Promise<TagEntry[]> {
        const { data } = await supabase
            .from('user_tags')
            .select('tags')
            .eq('user_id', userId)
            .maybeSingle();
        return data?.tags ?? [];
    }

    async saveUserTags(userId: UserId, tags: TagEntry[]): Promise<void> {
        await supabase.from('user_tags').upsert({
            user_id: userId,
            tags,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }

    async getUserFolders(userId: UserId): Promise<FolderEntry[]> {
        const { data } = await supabase
            .from('user_folders')
            .select('folders')
            .eq('user_id', userId)
            .maybeSingle();
        return data?.folders ?? [];
    }

    async saveUserFolders(userId: UserId, folders: FolderEntry[]): Promise<void> {
        await supabase.from('user_folders').upsert({
            user_id: userId,
            folders,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    }

    // ─── Reset All User Data ────────────────────────────────────────────────

    /**
     * Delete ALL user data from Supabase:
     * - All projects owned by the user
     * - All extensions authored by the user
     * - All extension votes by the user
     * - User tags
     * - User folders
     */
    async resetAllUserData(userId: UserId): Promise<void> {
        console.log(`[SupabaseMetaService] Resetting all data for user ${userId}...`);

        // Delete all projects owned by the user
        const { error: projectsError } = await supabase
            .from('projects')
            .delete()
            .eq('owner_id', userId);
        if (projectsError) {
            console.warn('[SupabaseMetaService] Error deleting projects:', projectsError);
        } else {
            console.log('[SupabaseMetaService] Deleted all user projects');
        }

        // Delete all extensions authored by the user
        const { error: extensionsError } = await supabase
            .from('extensions')
            .delete()
            .eq('author_id', userId);
        if (extensionsError) {
            console.warn('[SupabaseMetaService] Error deleting extensions:', extensionsError);
        } else {
            console.log('[SupabaseMetaService] Deleted all user extensions');
        }

        // Delete all extension votes by the user
        const { error: votesError } = await supabase
            .from('extension_votes')
            .delete()
            .eq('user_id', userId);
        if (votesError) {
            console.warn('[SupabaseMetaService] Error deleting extension votes:', votesError);
        } else {
            console.log('[SupabaseMetaService] Deleted all user extension votes');
        }

        // Delete user tags
        const { error: tagsError } = await supabase
            .from('user_tags')
            .delete()
            .eq('user_id', userId);
        if (tagsError) {
            console.warn('[SupabaseMetaService] Error deleting user tags:', tagsError);
        } else {
            console.log('[SupabaseMetaService] Deleted user tags');
        }

        // Delete user folders
        const { error: foldersError } = await supabase
            .from('user_folders')
            .delete()
            .eq('user_id', userId);
        if (foldersError) {
            console.warn('[SupabaseMetaService] Error deleting user folders:', foldersError);
        } else {
            console.log('[SupabaseMetaService] Deleted user folders');
        }

        console.log('[SupabaseMetaService] User data reset complete');
    }
}

// ─── Row Mappers ────────────────────────────────────────────────────────────

function metaToRow(m: ProjectMeta): Record<string, unknown> {
    return {
        id: m.id,
        name: m.name,
        owner_id: m.ownerId,
        owner_email: m.ownerEmail,
        description: m.description,
        visibility: m.visibility,
        tags: m.tags,
        folder: m.folder,
        thumbnail: m.thumbnail,
        last_modified: new Date(m.lastModified).toISOString(),
        created_at: new Date(m.createdAt).toISOString(),
        remote_provider: m.remoteProvider,
        remote_locator: m.remoteLocator,
        locked_by: m.lockedBy,
        updated_at: new Date().toISOString(),
    };
}

function rowToMeta(row: any): ProjectMeta {
    return {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        ownerEmail: row.owner_email ?? '',
        description: row.description ?? '',
        visibility: row.visibility ?? 'private',
        tags: row.tags ?? [],
        folder: row.folder ?? '',
        thumbnail: row.thumbnail ?? '',
        lastModified: new Date(row.last_modified ?? row.updated_at).getTime(),
        createdAt: new Date(row.created_at).getTime(),
        remoteProvider: row.remote_provider ?? 'github',
        remoteLocator: row.remote_locator ?? '',
        lockedBy: row.locked_by ?? null,
    };
}

function rowToExtension(row: any): ExtensionEntry {
    return {
        id: row.id,
        manifest: {
            id: row.id,
            name: row.name ?? row.id,
            description: row.description ?? '',
            author: row.author_email ?? '',
            version: row.version ?? '1.0.0',
            icon: row.icon ?? 'Package',
            category: row.category,
        },
        stats: {
            downloads: row.downloads ?? 0,
            likes: row.likes ?? 0,
            dislikes: row.dislikes ?? 0,
        },
        status: row.status ?? 'development',
        remoteProvider: row.remote_provider ?? 'github',
        remoteOwner: row.remote_owner ?? '',
        remoteRepo: row.remote_repo ?? '',
        authorId: row.author_id ?? '',
        authorEmail: row.author_email ?? '',
    };
}

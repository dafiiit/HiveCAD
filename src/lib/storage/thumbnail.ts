export function getThumbnailKeys(projectId?: string | null, projectName?: string | null) {
    return Array.from(
        new Set(
            [projectId, projectName].filter((value): value is string => Boolean(value && value.trim()))
        )
    );
}

export function resolveProjectThumbnail(
    thumbnails: Record<string, string> | undefined,
    projectId?: string | null,
    projectName?: string | null,
    explicitThumbnail?: string | null,
) {
    return (
        explicitThumbnail ??
        (projectId ? thumbnails?.[projectId] : undefined) ??
        (projectName ? thumbnails?.[projectName] : undefined) ??
        ''
    );
}

export function upsertProjectThumbnail(
    thumbnails: Record<string, string>,
    thumbnail: string,
    projectId?: string | null,
    projectName?: string | null,
) {
    const next = { ...thumbnails };
    for (const key of getThumbnailKeys(projectId, projectName)) {
        next[key] = thumbnail;
    }
    return next;
}

export function removeProjectThumbnail(
    thumbnails: Record<string, string>,
    projectId?: string | null,
    projectName?: string | null,
) {
    const next = { ...thumbnails };
    for (const key of getThumbnailKeys(projectId, projectName)) {
        delete next[key];
    }
    return next;
}

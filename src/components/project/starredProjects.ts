const STARRED_PROJECTS_STORAGE_KEY = 'hivecad_starred_projects';

const normalizeStarredProjects = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
};

export const loadStarredProjects = (): string[] => {
    try {
        const raw = localStorage.getItem(STARRED_PROJECTS_STORAGE_KEY);
        if (!raw) {
            return [];
        }

        return normalizeStarredProjects(JSON.parse(raw));
    } catch (error) {
        console.warn('[StarredProjects] Failed to load starred projects', error);
        return [];
    }
};

export const saveStarredProjects = (projectIds: string[]) => {
    try {
        localStorage.setItem(STARRED_PROJECTS_STORAGE_KEY, JSON.stringify(normalizeStarredProjects(projectIds)));
    } catch (error) {
        console.warn('[StarredProjects] Failed to save starred projects', error);
    }
};

export const toggleStarredProject = (projectIds: string[], projectId: string) => {
    if (projectIds.includes(projectId)) {
        return projectIds.filter(id => id !== projectId);
    }

    return [...projectIds, projectId];
};

export const clearStarredProjects = () => {
    try {
        localStorage.removeItem(STARRED_PROJECTS_STORAGE_KEY);
    } catch (error) {
        console.warn('[StarredProjects] Failed to clear starred projects', error);
    }
};

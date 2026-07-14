const getLocalStorage = (): Storage | undefined => {
    try {
        return typeof window === 'undefined' ? undefined : window.localStorage;
    } catch {
        return undefined;
    }
};

export const readStorageItem = (key: string): string | null => {
    const storage = getLocalStorage();
    if (!storage) return null;

    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
};

export const writeStorageItem = (key: string, value: string): void => {
    const storage = getLocalStorage();
    if (!storage) return;

    try {
        storage.setItem(key, value);
    } catch {
        // Ignore storage failures in constrained browser contexts.
    }
};

export const removeStorageItem = (key: string): void => {
    const storage = getLocalStorage();
    if (!storage) return;

    try {
        storage.removeItem(key);
    } catch {
        // Ignore storage failures in constrained browser contexts.
    }
};

export const readJsonStorage = <T>(key: string, fallback: T): T => {
    const raw = readStorageItem(key);
    if (!raw) return fallback;

    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
};

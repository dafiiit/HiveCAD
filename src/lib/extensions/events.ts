export const EXTENSION_STORE_OPEN_EVENT = 'hivecad:open-extension-store';

export type ExtensionStoreOpenDetail = {
    extensionId?: string;
    source?: 'command-palette' | 'toolbar' | 'other';
};

export function dispatchOpenExtensionStore(detail?: ExtensionStoreOpenDetail): boolean {
    if (typeof window === 'undefined') return false;
    window.dispatchEvent(new CustomEvent(EXTENSION_STORE_OPEN_EVENT, { detail }));
    return true;
}

export function onOpenExtensionStore(handler: (detail?: ExtensionStoreOpenDetail) => void): () => void {
    if (typeof window === 'undefined') return () => { };
    const listener = (event: Event) => {
        handler((event as CustomEvent<ExtensionStoreOpenDetail>).detail);
    };
    window.addEventListener(EXTENSION_STORE_OPEN_EVENT, listener);
    return () => window.removeEventListener(EXTENSION_STORE_OPEN_EVENT, listener);
}

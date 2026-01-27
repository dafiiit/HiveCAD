import { createContext, useContext } from 'react';
import { ProjectData } from '@/lib/storage/types';

export interface Tab {
    id: string;
    type: 'dashboard' | 'project';
    title: string;
    projectId?: string;
    store: any; // StoreApi<CADState>
}

export interface TabContextType {
    tabs: Tab[];
    activeTabId: string;
    openProjectInNewTab: (project: ProjectData) => void;
    createNewTab: () => void;
    closeTab: (tabId: string) => void;
    switchToTab: (tabId: string) => void;
}

export const TabContext = createContext<TabContextType | null>(null);

export const useTabManager = () => {
    const context = useContext(TabContext);
    if (!context) {
        throw new Error('useTabManager must be used within a TabManager');
    }
    return context;
};

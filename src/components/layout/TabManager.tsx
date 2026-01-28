import React, { useState, useEffect } from 'react';
import { BackgroundSyncHandler } from '@/components/layout/BackgroundSyncHandler';
import { UnsavedChangesListener } from '@/components/layout/UnsavedChangesListener';
import { StoreApi } from 'zustand';
import { Plus, X, Home, Box } from 'lucide-react';
import { CADStoreProvider } from '@/store/CADStoreContext';
import { createCADStore } from '@/store/createCADStore';
import { ProjectDashboard } from '@/components/project/ProjectDashboard';
import CADLayout from '@/components/cad/CADLayout';
import { TabContext, Tab } from './TabContext';
import { ProjectData } from '@/lib/storage/types';
import { cn } from '@/lib/utils';
import { useGlobalStore } from '@/store/useGlobalStore';

export const TabManager = () => {
    const [tabs, setTabs] = useState<Tab[]>([
        { id: 'dashboard', type: 'dashboard', title: 'Dashboard', store: createCADStore() }
    ]);
    const [activeTabId, setActiveTabId] = useState('dashboard');
    const { user } = useGlobalStore();

    // Enable background sync
    // Background sync moved inside provider

    // Warn on unsaved changes


    const createNewTab = () => {
        const newTabId = `tab-${Date.now()}`;
        // Creates a new Dashboard tab for selecting a project
        setTabs(prev => [...prev, {
            id: newTabId,
            type: 'dashboard',
            title: 'New Tab',
            store: createCADStore()
        }]);
        setActiveTabId(newTabId);
    };

    const openProjectInNewTab = (project: ProjectData) => {
        // If we are on a dashboard tab, convert it to a project tab
        // Otherwise open a new tab?
        // Requirement: "When a new tab is created, the user should be directed to the Project Dashboard. From the Project Dashboard, the user should be able to select an existing project or create a new one."

        // So if the current tab is 'dashboard', we replace its type with 'project' and load data.
        setTabs(prev => prev.map(tab => {
            if (tab.id === activeTabId && tab.type === 'dashboard') {
                const store: StoreApi<any> = tab.store;
                // Initialize store with project data
                if (project.id) {
                    store.getState().setProjectId(project.id);
                    console.log(`[TabManager] Set projectId: ${project.id}`);
                }
                store.getState().setFileName(project.name);
                if (project.files?.code) store.getState().setCode(project.files.code);

                // If we loaded from local cache (which we assume if it has data but maybe not synced), 
                // we should check if we need to sync. 
                // Ideally `ProjectDashboard` passes a flag `isLocal`. 
                // But for now, let's assume if it opens, we just mark it as potentially having changes 
                // if we want to be safe, OR we assume `ProjectDashboard` will handle it.
                // Re-reading plan: "Automatically load ... and immediately schedule a background push".
                // So we should set `hasUnpushedChanges: true` on mount?
                // A safer bet: The sync logic relies on `hasUnpushedChanges`.
                // If we set it to true here, `useBackgroundSync` will pick it up.
                store.setState({ hasUnpushedChanges: true });
                // Objects loading would happen here if we had them in ProjectData fully, or via storage adapter loading

                return {
                    ...tab,
                    type: 'project',
                    title: project.name,
                    projectId: project.id // assuming project has ID, or use name
                };
            }
            return tab;
        }));
    };

    const closeTab = (tabId: string) => {
        // If it's the last tab
        if (tabs.length === 1) {
            // If it's a project tab, convert it back to dashboard
            const tab = tabs[0];
            if (tab.type === 'project') {
                const store: StoreApi<any> = tab.store;
                // Clean up properly including thumbnail saving
                if (store.getState().closeProject) {
                    store.getState().closeProject();
                } else {
                    store.getState().reset();
                    store.getState().setFileName('Untitled');
                }

                setTabs([{
                    ...tab,
                    id: 'dashboard',
                    type: 'dashboard',
                    title: 'Dashboard',
                    projectId: undefined
                }]);
                setActiveTabId('dashboard');
            }
            return;
        }

        const tabToRemove = tabs.find(t => t.id === tabId);
        // Clean up store before removing tab
        if (tabToRemove && tabToRemove.type === 'project') {
            const store: StoreApi<any> = tabToRemove.store;
            if (store.getState().closeProject) {
                store.getState().closeProject();
            }
        }

        const tabIndex = tabs.findIndex(t => t.id === tabId);
        const newTabs = tabs.filter(t => t.id !== tabId);
        setTabs(newTabs);

        if (activeTabId === tabId) {
            // Switch to nearest tab
            const newActiveIndex = Math.max(0, tabIndex - 1);
            setActiveTabId(newTabs[newActiveIndex].id);
        }
    };

    const switchToTab = (tabId: string) => {
        setActiveTabId(tabId);
    };

    return (
        <TabContext.Provider value={{ tabs, activeTabId, openProjectInNewTab, createNewTab, closeTab, switchToTab }}>
            <div className="flex flex-col w-full h-full bg-background">


                {/* Tab Content */}
                <div className="flex-1 overflow-hidden relative">
                    {tabs.map(tab => (
                        <div
                            key={tab.id}
                            className="w-full h-full absolute inset-0"
                            style={{
                                visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                                zIndex: tab.id === activeTabId ? 10 : 0
                            }}
                        >
                            <CADStoreProvider store={tab.store}>
                                <BackgroundSyncHandler />
                                <UnsavedChangesListener />
                                {tab.type === 'dashboard' ? <ProjectDashboard /> : <CADLayout />}
                            </CADStoreProvider>
                        </div>
                    ))}
                </div>
            </div>
        </TabContext.Provider>
    );
};

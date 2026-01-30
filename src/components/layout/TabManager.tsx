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
import { CommandPalette } from '@/components/ui/CommandPalette';
import { ProjectData } from '@/lib/storage/types';
import { cn } from '@/lib/utils';
import { useGlobalStore } from '@/store/useGlobalStore';
import { isProjectEmpty, deleteProjectPermanently } from '@/lib/storage/projectUtils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from 'sonner';
import { ErrorBoundary } from '../ErrorBoundary';

export const TabManager = () => {
    const [tabs, setTabs] = useState<Tab[]>([
        { id: 'dashboard', type: 'dashboard', title: 'Dashboard', store: createCADStore() }
    ]);
    const [activeTabId, setActiveTabId] = useState('dashboard');
    const [tabToDelete, setTabToDelete] = useState<Tab | null>(null);
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
                if (project.name) store.getState().setFileName(project.name);
                if (project.cad) {
                    if (project.cad.code) store.getState().setCode(project.cad.code);
                    // If we have serialized objects, we could load them here, 
                    // but we usually rely on runCode() to reconstruct them from code.
                    // However, for consistency we can set them.
                    if (project.cad.objects) {
                        // Filter out objects with invalid geometry (from JSON)
                        const cleanObjects = (project.cad.objects as any[]).map(obj => ({
                            ...obj,
                            geometry: undefined,
                            edgeGeometry: undefined
                        }));
                        store.setState({ objects: cleanObjects });
                    }
                } else if (project.files?.code) {
                    store.getState().setCode(project.files.code);
                } else if ((project as any).code) {
                    // Very old legacy flat structure
                    store.getState().setCode((project as any).code);
                }

                if (project.vcs) {
                    store.getState().hydrateVCS(project.vcs);
                }

                // Always trigger runCode after loading if we have code
                if (store.getState().code) {
                    store.getState().runCode();
                }

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
        const tabToRemove = tabs.find(t => t.id === tabId);

        // Confirmation for empty projects
        if (tabToRemove && tabToRemove.type === 'project') {
            const store: StoreApi<any> = tabToRemove.store;
            const state = store.getState();
            if (isProjectEmpty(state.code, state.objects)) {
                setTabToDelete(tabToRemove);
                return;
            }
        }

        executeCloseTab(tabId);
    };

    const executeCloseTab = (tabId: string) => {
        const tabToRemove = tabs.find(t => t.id === tabId);
        if (!tabToRemove) return;
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
                    store.setState({
                        planeVisibility: {
                            XY: true,
                            XZ: true,
                            YZ: true,
                        }
                    });
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

        const tabIndex = tabs.findIndex(t => t.id === tabId);
        const newTabs = tabs.filter(t => t.id !== tabId);

        // Clean up store before removing tab
        if (tabToRemove && tabToRemove.type === 'project') {
            const store: StoreApi<any> = tabToRemove.store;
            if (store.getState().closeProject) {
                store.getState().closeProject();
            }
        }

        setTabs(newTabs);

        if (activeTabId === tabId) {
            // Switch to nearest tab
            const newActiveIndex = Math.max(0, tabIndex - 1);
            setActiveTabId(newTabs[newActiveIndex].id);
        }
    };

    const handleConfirmDelete = async () => {
        if (!tabToDelete) return;
        const tabId = tabToDelete.id;
        const projectId = tabToDelete.projectId;
        const projectName = tabToDelete.title;
        const store: StoreApi<any> = tabToDelete.store;

        try {
            // 1. Immediately delete if we have an ID
            if (projectId) {
                toast.promise(
                    deleteProjectPermanently(projectId, projectName, store.getState().removeThumbnail),
                    {
                        loading: `Deleting empty project "${projectName}"...`,
                        success: `Project deleted`,
                        error: `Failed to delete project`,
                    }
                );
            }

            // 2. Clear state in store to prevent any background saves
            if (store.getState().reset) {
                store.getState().reset();
            }

            // 3. Close the tab
            executeCloseTab(tabId);
        } catch (error) {
            console.error("Deletion failed:", error);
            // Still close the tab but warn
            executeCloseTab(tabId);
        } finally {
            setTabToDelete(null);
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
                                <ErrorBoundary name={tab.type === 'dashboard' ? "Dashboard" : "Project"}>
                                    <BackgroundSyncHandler />
                                    <UnsavedChangesListener />
                                    {tab.type === 'dashboard' ? <ProjectDashboard /> : (
                                        <>
                                            <CADLayout />
                                            <CommandPalette />
                                        </>
                                    )}
                                </ErrorBoundary>
                            </CADStoreProvider>
                        </div>
                    ))}
                </div>

                <AlertDialog open={!!tabToDelete} onOpenChange={(open) => !open && setTabToDelete(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete empty project?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This project is empty and doesn't contain any CAD models. It will be permanently deleted from your workspace.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Keep Project</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleConfirmDelete}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Delete Project
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </TabContext.Provider>
    );
};

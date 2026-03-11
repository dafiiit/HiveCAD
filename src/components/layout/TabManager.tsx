import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { isProjectEmpty } from '@/lib/storage/projectUtils';
import { StorageManager } from '@/lib/storage/StorageManager';
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
    const tabsRef = useRef(tabs);
    const activeTabIdRef = useRef(activeTabId);

    useEffect(() => {
        tabsRef.current = tabs;
    }, [tabs]);

    useEffect(() => {
        activeTabIdRef.current = activeTabId;
    }, [activeTabId]);

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

    const hydrateProjectStore = useCallback((store: StoreApi<any>, project: ProjectData) => {
        store.getState().setProjectId(project.meta.id);
        store.getState().setFileName(project.meta.name);
        store.getState().setProjectFolder(project.meta.folder || '');
        console.log(`[TabManager] Set projectId: ${project.meta.id}`);

        if (project.snapshot.code) {
            store.getState().setCode(project.snapshot.code);
        }

        if (project.snapshot.objects?.length) {
            const cleanObjects = project.snapshot.objects.map((obj: any) => ({
                ...obj,
                geometry: undefined,
                edgeGeometry: undefined,
            }));
            store.setState({ objects: cleanObjects });
        }

        if (project.snapshot.sketches?.length) {
            store.getState().loadSketches(project.snapshot.sketches);
        }

        if (store.getState().code) {
            store.getState().runCode();
        }

        store.setState({ hasUnpushedChanges: true });
    }, []);

    const openProjectInNewTab = useCallback((project: ProjectData) => {
        const targetTab = tabsRef.current.find(
            (tab) => tab.id === activeTabIdRef.current && tab.type === 'dashboard'
        );

        if (!targetTab) {
            return;
        }

        hydrateProjectStore(targetTab.store, project);

        setTabs((prev) => prev.map((tab) => {
            if (tab.id !== targetTab.id) {
                return tab;
            }

            return {
                ...tab,
                type: 'project',
                title: project.meta.name,
                projectId: project.meta.id,
            };
        }));
    }, [hydrateProjectStore]);

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

        // Optimistically close the dialog
        setTabToDelete(null);

        // If it's just a new tab (no project ID), just close it
        if (!projectId) {
            executeCloseTab(tabId);
            return;
        }

        const toastId = toast.loading(`Deleting "${projectName}"...`);

        try {
            const mgr = StorageManager.getInstance();

            // 1. Delete from all stores (tombstone written by QuickStore.deleteProject)
            // Delete locally (writes tombstone to prevent re-sync)
            await mgr.quickStore.deleteProject(projectId);

            // Delete from GitHub
            if (mgr.isRemoteConnected) {
                try {
                    await mgr.remoteStore!.deleteProject(projectId);
                } catch (err) {
                    console.warn(`[TabManager] Failed to delete ${projectId} from remote (will retry on next sync):`, err);
                }
            }

            // Delete from Supabase
            try {
                await mgr.supabaseMeta?.deleteProjectMeta(projectId);
            } catch (err) {
                console.warn(`[TabManager] Failed to delete ${projectId} from Supabase:`, err);
            }

            // Clean up thumbnail
            store.getState().removeThumbnail?.(projectName);

            // 2. Clear state in store to prevent any background saves
            if (store.getState().reset) {
                store.getState().reset();
            }

            toast.success(`Deleted "${projectName}"`, { id: toastId });

            // 3. Close the tab
            executeCloseTab(tabId);

            // 4. Determine if we need to refresh the dashboard
            // If the active tab is a dashboard, we should refresh its project list
            // We can do this by finding all dashboard tabs and triggering a refresh if possible
            // But since ProjectDashboard refreshes on mount/focus, simply closing this tab and returning to dashboard might be enough regarding UI state
            // However, to be safe, if there are other dashboard tabs, they might state stale data.
            // The ProjectDashboard uses useGlobalStore or internal state.
            // For now, we rely on the user navigating to the dashboard which triggers a refresh or using the refresh button.
            // Actually, we can try to find a dashboard tab and see if we can trigger something, but ProjectDashboard logic is self-contained.
            // The previous implementation in ProjectDashboard calls refreshProjects().
            // We can't easily call that here without context.
            // But since we are deleting the *current* project tab, we will land on another tab.
            // If that tab is the dashboard, it might need to know.
            // ProjectDashboard listens to focus or can be triggered.
            // Let's rely on the dashboard's own polling or refresh-on-focus/mount for now.

        } catch (error) {
            console.error("Deletion failed:", error);
            toast.error(`Failed to delete "${projectName}"`, { id: toastId });
            // Still close the tab if it was a partial failure?
            // Usually if delete fails, we might want to keep the tab open so user can retry or save stuff.
            // So we do NOT close the tab here on strict error, or maybe we do depending on UX preference.
            // The original code closed it anyway. Let's keep it open on error so user doesn't lose data if it was a network glitch?
            // But this is "Empty Project" warning. There is no data to lose really.
            // So closing it is probably fine.
            executeCloseTab(tabId);
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
                            <AlertDialogTitle>Delete empty 3D model?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This 3D model is empty and doesn't contain any geometry. It will be permanently deleted from your workspace.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Keep 3D Model</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleConfirmDelete}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Delete 3D Model
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </TabContext.Provider>
    );
};

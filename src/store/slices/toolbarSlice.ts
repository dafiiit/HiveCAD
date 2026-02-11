import { StateCreator } from 'zustand';
import { CADState, ToolbarSlice } from '../types';
import { useUIStore } from '../useUIStore';

export const createToolbarSlice: StateCreator<
    CADState,
    [],
    [],
    ToolbarSlice
> = (set, get) => {
    // Initial sync from global UI store
    const uiStore = useUIStore.getState();

    // Subscribe to global UI store to keep this slice in sync across all tabs
    useUIStore.subscribe((state) => {
        set({
            customToolbars: state.customToolbars,
            activeToolbarId: state.activeToolbarId,
            folders: state.folders,
            isEditingToolbar: state.isEditingToolbar
        });
    });

    return {
        // State mapped from useUIStore
        customToolbars: uiStore.customToolbars,
        activeToolbarId: uiStore.activeToolbarId,
        isEditingToolbar: uiStore.isEditingToolbar,
        folders: uiStore.folders,

        // Actions delegated to useUIStore
        addCustomToolbar: (name) => useUIStore.getState().addCustomToolbar(name),
        deleteCustomToolbar: (id) => useUIStore.getState().deleteCustomToolbar(id),
        renameCustomToolbar: (id, name) => useUIStore.getState().renameCustomToolbar(id, name),

        addSection: (toolbarId, label) => useUIStore.getState().addSection(toolbarId, label),
        deleteSection: (toolbarId, sectionId) => useUIStore.getState().deleteSection(toolbarId, sectionId),
        renameSection: (toolbarId, sectionId, label) => useUIStore.getState().renameSection(toolbarId, sectionId, label),
        reorderSections: (toolbarId, sectionIds) => useUIStore.getState().reorderSections(toolbarId, sectionIds),

        addToolToSection: (toolbarId, sectionId, toolId) => useUIStore.getState().addToolToSection(toolbarId, sectionId, toolId),
        removeToolFromSection: (toolbarId, sectionId, index) => useUIStore.getState().removeToolFromSection(toolbarId, sectionId, index),
        reorderToolsInSection: (toolbarId, sectionId, toolIds) => useUIStore.getState().reorderToolsInSection(toolbarId, sectionId, toolIds),
        moveToolBetweenSections: (toolbarId, sourceSectionId, targetSectionId, toolId, newIndex) =>
            useUIStore.getState().moveToolBetweenSections(toolbarId, sourceSectionId, targetSectionId, toolId, newIndex),

        addFolder: (toolbarId, sectionId, label) => useUIStore.getState().addFolder(toolbarId, sectionId, label),
        deleteFolder: (toolbarId, sectionId, folderId) => useUIStore.getState().deleteFolder(toolbarId, sectionId, folderId),
        renameFolder: (folderId, label) => useUIStore.getState().renameFolder(folderId, label),
        updateFolderIcon: (folderId, icon) => useUIStore.getState().updateFolderIcon(folderId, icon),
        addToolToFolder: (folderId, toolId) => useUIStore.getState().addToolToFolder(folderId, toolId),
        removeToolFromFolder: (folderId, toolIndex) => useUIStore.getState().removeToolFromFolder(folderId, toolIndex),
        reorderToolsInFolder: (folderId, toolIds) => useUIStore.getState().reorderToolsInFolder(folderId, toolIds),

        setEditingToolbar: (editing) => useUIStore.getState().setEditingToolbar(editing),

        setActiveToolbar: (id) => {
            useUIStore.getState().setActiveToolbar(id);
            if (id) {
                (get() as any).setActiveTab(id);
            }
        },

        // Extension store UI state
        extensionStoreOpen: false,
        extensionStoreQuery: '',
        setExtensionStoreOpen: (open) => set({ extensionStoreOpen: open }),
        setExtensionStoreQuery: (query) => set({ extensionStoreQuery: query }),
    };
};

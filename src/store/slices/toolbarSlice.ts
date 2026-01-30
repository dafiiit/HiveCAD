import { StateCreator } from 'zustand';
import { CADState, ToolbarSlice, CustomToolbar, ToolbarSection, ToolbarFolder } from '../types';
import { toast } from 'sonner';

const generateId = () => Math.random().toString(36).substring(2, 9);

const BODY_FOLDER_ID = 'folder-body';

const INITIAL_TOOLBARS: CustomToolbar[] = [
    {
        id: 'SOLID',
        name: 'SOLID',
        sections: [
            { id: generateId(), label: 'CREATE', toolIds: ['sketch', `folder:${BODY_FOLDER_ID}`, 'extrusion', 'revolve'] },
            { id: generateId(), label: 'MODIFY', toolIds: ['move', 'rotate', 'scale', 'duplicate', 'delete'] },
            { id: generateId(), label: 'COMBINE', toolIds: ['join', 'cut', 'intersect'] },
            { id: generateId(), label: 'CONFIGURE', toolIds: ['parameters', 'pattern'] },
            { id: generateId(), label: 'CONSTRUCT', toolIds: ['plane', 'axis', 'point'] },
            { id: generateId(), label: 'INSPECT', toolIds: ['measure', 'analyze'] }
        ]
    }
];

const INITIAL_FOLDERS: Record<string, ToolbarFolder> = {
    [BODY_FOLDER_ID]: {
        id: BODY_FOLDER_ID,
        label: 'Body',
        icon: 'Box',
        toolIds: ['box', 'cylinder', 'sphere', 'torus', 'coil']
    }
};

export const createToolbarSlice: StateCreator<
    CADState,
    [],
    [],
    ToolbarSlice
> = (set, get) => ({
    customToolbars: INITIAL_TOOLBARS,
    activeToolbarId: 'SOLID',
    isEditingToolbar: false,
    folders: INITIAL_FOLDERS,

    addCustomToolbar: (name = 'New Toolbox') => {
        const id = generateId();
        const newToolbar: CustomToolbar = {
            id,
            name,
            sections: []
        };
        set(state => ({
            customToolbars: [...state.customToolbars, newToolbar],
            activeToolbarId: id,
            isEditingToolbar: true
        }));
        return id;
    },

    deleteCustomToolbar: (id) => {
        set(state => {
            const newToolbars = state.customToolbars.filter(t => t.id !== id);
            let newActiveId = state.activeToolbarId;
            if (state.activeToolbarId === id) {
                newActiveId = 'SOLID';
            }
            return {
                customToolbars: newToolbars,
                activeToolbarId: newActiveId
            };
        });
    },

    renameCustomToolbar: (id, name) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t =>
                t.id === id ? { ...t, name } : t
            )
        }));
    },

    addSection: (toolbarId, label = 'new section') => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return {
                        ...t,
                        sections: [...t.sections, { id: generateId(), label, toolIds: [] }]
                    };
                }
                return t;
            })
        }));
    },

    deleteSection: (toolbarId, sectionId) => {
        set(state => {
            // Find tools/folders in the section being deleted
            const toolbar = state.customToolbars.find(t => t.id === toolbarId);
            const section = toolbar?.sections.find(s => s.id === sectionId);

            // Clean up folders that were only in this section
            const newFolders = { ...state.folders };
            section?.toolIds.forEach(id => {
                if (id.startsWith('folder:')) {
                    const folderId = id.replace('folder:', '');
                    delete newFolders[folderId];
                }
            });

            return {
                folders: newFolders,
                customToolbars: state.customToolbars.map(t => {
                    if (t.id === toolbarId) {
                        return {
                            ...t,
                            sections: t.sections.filter(s => s.id !== sectionId)
                        };
                    }
                    return t;
                })
            };
        });
    },

    renameSection: (toolbarId, sectionId, label) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return {
                        ...t,
                        sections: t.sections.map(s =>
                            s.id === sectionId ? { ...s, label } : s
                        )
                    };
                }
                return t;
            })
        }));
    },

    reorderSections: (toolbarId, sectionIds) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    const sectionMap = new Map(t.sections.map(s => [s.id, s]));
                    const newSections = sectionIds.map(id => sectionMap.get(id)).filter(Boolean) as ToolbarSection[];
                    return { ...t, sections: newSections };
                }
                return t;
            })
        }));
    },

    addToolToSection: (toolbarId, sectionId, toolId) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return {
                        ...t,
                        sections: t.sections.map(s => {
                            if (s.id === sectionId) {
                                if (s.toolIds.includes(toolId)) {
                                    toast.error('Tool already in section');
                                    return s;
                                }
                                return { ...s, toolIds: [...s.toolIds, toolId] };
                            }
                            return s;
                        })
                    };
                }
                return t;
            })
        }));
    },

    removeToolFromSection: (toolbarId, sectionId, index) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return {
                        ...t,
                        sections: t.sections.map(s => {
                            if (s.id === sectionId) {
                                const toolId = s.toolIds[index];
                                const newToolIds = [...s.toolIds];
                                newToolIds.splice(index, 1);

                                // Clean up folder if it was removed
                                const newFolders = { ...state.folders };
                                if (toolId?.startsWith('folder:')) {
                                    delete newFolders[toolId.replace('folder:', '')];
                                }

                                return { ...s, toolIds: newToolIds };
                            }
                            return s;
                        })
                    };
                }
                return t;
            })
        }));
    },

    reorderToolsInSection: (toolbarId, sectionId, toolIds) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return {
                        ...t,
                        sections: t.sections.map(s => {
                            if (s.id === sectionId) {
                                return { ...s, toolIds };
                            }
                            return s;
                        })
                    };
                }
                return t;
            })
        }));
    },

    moveToolBetweenSections: (toolbarId, sourceSectionId, targetSectionId, toolId, newIndex) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return {
                        ...t,
                        sections: t.sections.map(s => {
                            if (s.id === sourceSectionId) {
                                return { ...s, toolIds: s.toolIds.filter(id => id !== toolId) };
                            }
                            if (s.id === targetSectionId) {
                                const newToolIds = [...s.toolIds];
                                newToolIds.splice(newIndex, 0, toolId);
                                return { ...s, toolIds: newToolIds };
                            }
                            return s;
                        })
                    };
                }
                return t;
            })
        }));
    },

    addFolder: (toolbarId, sectionId, label = 'New Folder') => {
        const id = generateId();
        const folderId = `folder-${id}`;
        set(state => ({
            folders: {
                ...state.folders,
                [folderId]: { id: folderId, label, icon: 'Package', toolIds: [] }
            },
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return {
                        ...t,
                        sections: t.sections.map(s => {
                            if (s.id === sectionId) {
                                return { ...s, toolIds: [...s.toolIds, `folder:${folderId}`] };
                            }
                            return s;
                        })
                    };
                }
                return t;
            })
        }));
        return folderId;
    },

    deleteFolder: (toolbarId, sectionId, folderId) => {
        set(state => {
            const newFolders = { ...state.folders };
            delete newFolders[folderId];

            return {
                folders: newFolders,
                customToolbars: state.customToolbars.map(t => {
                    if (t.id === toolbarId) {
                        return {
                            ...t,
                            sections: t.sections.map(s => {
                                if (s.id === sectionId) {
                                    return { ...s, toolIds: s.toolIds.filter(id => id !== `folder:${folderId}`) };
                                }
                                return s;
                            })
                        };
                    }
                    return t;
                })
            };
        });
    },

    renameFolder: (folderId, label) => {
        set(state => ({
            folders: {
                ...state.folders,
                [folderId]: { ...state.folders[folderId], label }
            }
        }));
    },

    updateFolderIcon: (folderId, icon) => {
        set(state => ({
            folders: {
                ...state.folders,
                [folderId]: { ...state.folders[folderId], icon }
            }
        }));
    },

    addToolToFolder: (folderId, toolId) => {
        set(state => {
            const folder = state.folders[folderId];
            if (!folder) return state;
            if (folder.toolIds.includes(toolId)) {
                toast.error('Tool already in folder');
                return state;
            }
            return {
                folders: {
                    ...state.folders,
                    [folderId]: { ...folder, toolIds: [...folder.toolIds, toolId] }
                }
            };
        });
    },

    removeToolFromFolder: (folderId, toolIndex) => {
        set(state => {
            const folder = state.folders[folderId];
            if (!folder) return state;
            const newToolIds = [...folder.toolIds];
            newToolIds.splice(toolIndex, 1);
            return {
                folders: {
                    ...state.folders,
                    [folderId]: { ...folder, toolIds: newToolIds }
                }
            };
        });
    },

    reorderToolsInFolder: (folderId, toolIds) => {
        set(state => {
            const folder = state.folders[folderId];
            if (!folder) return state;
            return {
                folders: {
                    ...state.folders,
                    [folderId]: { ...folder, toolIds }
                }
            };
        });
    },

    setEditingToolbar: (editing) => set({ isEditingToolbar: editing }),

    setActiveToolbar: (id) => {
        set({ activeToolbarId: id, isEditingToolbar: false });
        if (id) {
            (get() as any).setActiveTab(id);
        }
    }
});

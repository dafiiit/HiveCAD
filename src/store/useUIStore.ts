import { create } from 'zustand';
import { CustomToolbar, ToolbarFolder, ToolbarSection } from './types';
import { toast } from 'sonner';
import { StorageManager } from '@/lib/storage/StorageManager';
import { ID } from '@/lib/utils/id-generator';

const generateId = () => ID.generatePrefixed('ui');

const BODY_FOLDER_ID = 'folder-body';
const SKETCH_SHAPE_FOLDER_ID = 'folder-sketch-shape';
const SKETCH_SPLINE_FOLDER_ID = 'folder-sketch-spline';
const OTHER_CONSTRAINTS_FOLDER_ID = 'folder-other-constraints';
let saveTimeout: any = null;

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
    },
    {
        id: 'SKETCH',
        name: 'SKETCH',
        sections: [
            {
                id: generateId(),
                label: 'CREATE',
                toolIds: [
                    'line',
                    'threePointsArc',
                    `folder:${SKETCH_SHAPE_FOLDER_ID}`,
                    `folder:${SKETCH_SPLINE_FOLDER_ID}`,
                    'sketchPoint'
                ]
            },
            { id: generateId(), label: 'MODIFY', toolIds: ['trim', 'offset', 'mirror', 'toggleConstruction', 'dimension'] },
            { id: generateId(), label: 'CONSTRAIN', toolIds: ['coincident', 'horizontal', 'vertical', 'tangent', `folder:${OTHER_CONSTRAINTS_FOLDER_ID}`] }
        ]
    }
];

const INITIAL_FOLDERS: Record<string, ToolbarFolder> = {
    [BODY_FOLDER_ID]: {
        id: BODY_FOLDER_ID,
        label: 'Body',
        icon: 'Box',
        toolIds: ['box', 'cylinder', 'sphere', 'torus', 'coil']
    },
    [SKETCH_SHAPE_FOLDER_ID]: {
        id: SKETCH_SHAPE_FOLDER_ID,
        label: 'Shape',
        icon: 'RectangleHorizontal',
        toolIds: ['rectangle', 'roundedRectangle', 'circle', 'ellipse', 'polygon', 'text']
    },
    [SKETCH_SPLINE_FOLDER_ID]: {
        id: SKETCH_SPLINE_FOLDER_ID,
        label: 'Spline',
        icon: 'Spline',
        toolIds: ['smoothSpline', 'bezier', 'quadraticBezier', 'cubicBezier']
    },
    [OTHER_CONSTRAINTS_FOLDER_ID]: {
        id: OTHER_CONSTRAINTS_FOLDER_ID,
        label: 'Other Constraints',
        icon: 'Link2',
        toolIds: ['symmetric', 'equal', 'parallel', 'perpendicular', 'fixed', 'midpoint', 'concentric', 'collinear', 'pointOnLine', 'pointOnCircle', 'equalRadius']
    }
};

const ensureDefaultSketchToolbar = (toolbars: CustomToolbar[]): CustomToolbar[] => {
    if (toolbars.some(t => t.id === 'SKETCH')) return toolbars;
    const sketchToolbar = INITIAL_TOOLBARS.find(t => t.id === 'SKETCH');
    if (!sketchToolbar) return toolbars;
    return [...toolbars, sketchToolbar];
};

const migrateSketchToolbar = (toolbars: CustomToolbar[]): CustomToolbar[] => {
    // Remove 'sketch' tool from SKETCH toolbar if present
    return toolbars.map(toolbar => {
        if (toolbar.id !== 'SKETCH') return toolbar;
        return {
            ...toolbar,
            sections: toolbar.sections.map(section => ({
                ...section,
                toolIds: section.toolIds.filter(id => id !== 'sketch')
            }))
        };
    });
};

const withDefaultFolders = (folders?: Record<string, ToolbarFolder>) => ({
    ...INITIAL_FOLDERS,
    ...(folders || {}),
});

interface UIState {
    customToolbars: CustomToolbar[];
    activeToolbarId: string | null;
    isEditingToolbar: boolean;
    folders: Record<string, ToolbarFolder>;
    isInitialized: boolean;
    theme: 'dark' | 'light';

    // Actions
    addCustomToolbar: (name?: string) => string;
    deleteCustomToolbar: (id: string) => void;
    renameCustomToolbar: (id: string, name: string) => void;
    addSection: (toolbarId: string, label?: string) => void;
    deleteSection: (toolbarId: string, sectionId: string) => void;
    renameSection: (toolbarId: string, sectionId: string, label: string) => void;
    reorderSections: (toolbarId: string, sectionIds: string[]) => void;
    addToolToSection: (toolbarId: string, sectionId: string, toolId: string) => void;
    removeToolFromSection: (toolbarId: string, sectionId: string, index: number) => void;
    reorderToolsInSection: (toolbarId: string, sectionId: string, toolIds: string[]) => void;
    moveToolBetweenSections: (toolbarId: string, sourceSectionId: string, targetSectionId: string, toolId: string, newIndex: number) => void;
    addFolder: (toolbarId: string, sectionId: string, label?: string) => string;
    deleteFolder: (toolbarId: string, sectionId: string, folderId: string) => void;
    renameFolder: (folderId: string, label: string) => void;
    updateFolderIcon: (folderId: string, icon: string) => void;
    addToolToFolder: (folderId: string, toolId: string) => void;
    removeToolFromFolder: (folderId: string, toolIndex: number) => void;
    reorderToolsInFolder: (folderId: string, toolIds: string[]) => void;
    setEditingToolbar: (editing: boolean) => void;
    setActiveToolbar: (id: string | null) => void;
    setTheme: (theme: 'dark' | 'light') => void;

    // Persistence
    loadSettings: () => Promise<void>;
    saveSettings: () => Promise<void>;
    initialize: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
    customToolbars: INITIAL_TOOLBARS,
    activeToolbarId: 'SOLID',
    isEditingToolbar: false,
    folders: INITIAL_FOLDERS,
    isInitialized: false,
    theme: 'dark',

    loadSettings: async () => {
        try {
            const mgr = StorageManager.getInstance();
            const remote = mgr.remoteStore;
            if (remote?.isConnected()) {
                const settings = await remote.pullUserSettings();
                if (settings && settings.customToolbars) {
                    const toolbars = ensureDefaultSketchToolbar(settings.customToolbars);
                    const migratedToolbars = migrateSketchToolbar(toolbars);
                    set({
                        customToolbars: migratedToolbars,
                        folders: withDefaultFolders(settings.folders),
                        activeToolbarId: settings.activeToolbarId || 'SOLID',
                        isInitialized: true,
                        theme: settings.theme || 'dark',
                    });
                    console.log('[UIStore] Settings loaded');
                }
            }
        } catch (error) {
            console.error('[UIStore] Failed to load settings:', error);
        }
    },

    saveSettings: async () => {
        if (saveTimeout) clearTimeout(saveTimeout);

        saveTimeout = setTimeout(async () => {
            try {
                const mgr = StorageManager.getInstance();
                const remote = mgr.remoteStore;
                if (remote?.isConnected()) {
                    const { customToolbars, folders, activeToolbarId, theme } = get();
                    await remote.pushUserSettings({
                        customToolbars,
                        folders,
                        activeToolbarId,
                        theme,
                    });
                    console.log('[UIStore] Settings saved');
                }
            } catch (error) {
                console.error('[UIStore] Failed to save settings:', error);
            } finally {
                saveTimeout = null;
            }
        }, 2000);
    },

    initialize: () => {
        if (get().isInitialized) return;
        get().loadSettings();
    },

    addCustomToolbar: (name = 'New Toolbox') => {
        const id = generateId();
        const newToolbar: CustomToolbar = { id, name, sections: [] };
        set(state => ({
            customToolbars: [...state.customToolbars, newToolbar],
            activeToolbarId: id,
            isEditingToolbar: true
        }));
        get().saveSettings();
        return id;
    },

    deleteCustomToolbar: (id) => {
        set(state => {
            const newToolbars = state.customToolbars.filter(t => t.id !== id);
            let newActiveId = state.activeToolbarId;
            if (state.activeToolbarId === id) newActiveId = 'SOLID';
            return { customToolbars: newToolbars, activeToolbarId: newActiveId };
        });
        get().saveSettings();
    },

    renameCustomToolbar: (id, name) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => t.id === id ? { ...t, name } : t)
        }));
        get().saveSettings();
    },

    addSection: (toolbarId, label = 'new section') => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return { ...t, sections: [...t.sections, { id: generateId(), label, toolIds: [] }] };
                }
                return t;
            })
        }));
        get().saveSettings();
    },

    deleteSection: (toolbarId, sectionId) => {
        set(state => {
            const toolbar = state.customToolbars.find(t => t.id === toolbarId);
            const section = toolbar?.sections.find(s => s.id === sectionId);
            const newFolders = { ...state.folders };
            section?.toolIds.forEach(id => {
                if (id.startsWith('folder:')) {
                    delete newFolders[id.replace('folder:', '')];
                }
            });
            return {
                folders: newFolders,
                customToolbars: state.customToolbars.map(t => {
                    if (t.id === toolbarId) {
                        return { ...t, sections: t.sections.filter(s => s.id !== sectionId) };
                    }
                    return t;
                })
            };
        });
        get().saveSettings();
    },

    renameSection: (toolbarId, sectionId, label) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return {
                        ...t,
                        sections: t.sections.map(s => s.id === sectionId ? { ...s, label } : s)
                    };
                }
                return t;
            })
        }));
        get().saveSettings();
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
        get().saveSettings();
    },

    addToolToSection: (toolbarId, sectionId, toolId) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return {
                        ...t,
                        sections: t.sections.map(s => {
                            if (s.id === sectionId) {
                                if (s.toolIds.includes(toolId)) return s;
                                return { ...s, toolIds: [...s.toolIds, toolId] };
                            }
                            return s;
                        })
                    };
                }
                return t;
            })
        }));
        get().saveSettings();
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
        get().saveSettings();
    },

    reorderToolsInSection: (toolbarId, sectionId, toolIds) => {
        set(state => ({
            customToolbars: state.customToolbars.map(t => {
                if (t.id === toolbarId) {
                    return {
                        ...t,
                        sections: t.sections.map(s => s.id === sectionId ? { ...s, toolIds } : s)
                    };
                }
                return t;
            })
        }));
        get().saveSettings();
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
        get().saveSettings();
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
                        sections: t.sections.map(s => s.id === sectionId ? { ...s, toolIds: [...s.toolIds, `folder:${folderId}`] } : s)
                    };
                }
                return t;
            })
        }));
        get().saveSettings();
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
                            sections: t.sections.map(s => s.id === sectionId ? { ...s, toolIds: s.toolIds.filter(id => id !== `folder:${folderId}`) } : s)
                        };
                    }
                    return t;
                })
            };
        });
        get().saveSettings();
    },

    renameFolder: (folderId, label) => {
        set(state => ({
            folders: { ...state.folders, [folderId]: { ...state.folders[folderId], label } }
        }));
        get().saveSettings();
    },

    updateFolderIcon: (folderId, icon) => {
        set(state => ({
            folders: { ...state.folders, [folderId]: { ...state.folders[folderId], icon } }
        }));
        get().saveSettings();
    },

    addToolToFolder: (folderId, toolId) => {
        set(state => {
            const folder = state.folders[folderId];
            if (!folder || folder.toolIds.includes(toolId)) return state;
            return {
                folders: { ...state.folders, [folderId]: { ...folder, toolIds: [...folder.toolIds, toolId] } }
            };
        });
        get().saveSettings();
    },

    removeToolFromFolder: (folderId, toolIndex) => {
        set(state => {
            const folder = state.folders[folderId];
            if (!folder) return state;
            const newToolIds = [...folder.toolIds];
            newToolIds.splice(toolIndex, 1);
            return {
                folders: { ...state.folders, [folderId]: { ...folder, toolIds: newToolIds } }
            };
        });
        get().saveSettings();
    },

    reorderToolsInFolder: (folderId, toolIds) => {
        set(state => {
            const folder = state.folders[folderId];
            if (!folder) return state;
            return {
                folders: { ...state.folders, [folderId]: { ...folder, toolIds } }
            };
        });
        get().saveSettings();
    },

    setEditingToolbar: (editing) => set({ isEditingToolbar: editing }),

    setActiveToolbar: (id) => {
        set({ activeToolbarId: id, isEditingToolbar: false });
        // Note: we don't immediately save here to avoid noise, or we do if we want it global
        get().saveSettings();
    },

    setTheme: (theme) => {
        set({ theme });
        get().saveSettings();
    }
}));

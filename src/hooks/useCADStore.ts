import { create } from 'zustand';
import * as THREE from 'three';

// Types
export type ToolType = 
  | 'select' | 'pan' | 'orbit'
  | 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil'
  | 'sketch' | 'line' | 'arc' | 'circle' | 'rectangle' | 'polygon' | 'spline'
  | 'move' | 'rotate' | 'scale' | 'copy'
  | 'trim' | 'join' | 'cut' | 'intersect'
  | 'measure' | 'dimension' | 'constrain'
  | 'plane' | 'axis' | 'point';

export type ViewType = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'home' | 'isometric';

export interface CADObject {
  id: string;
  name: string;
  type: 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil' | 'sketch' | 'extrusion';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  dimensions: Record<string, number>;
  color: string;
  visible: boolean;
  selected: boolean;
}

export interface HistoryItem {
  id: string;
  type: 'create' | 'modify' | 'delete' | 'sketch';
  name: string;
  timestamp: number;
  objectIds: string[];
  previousState?: CADObject[];
}

export interface Comment {
  id: string;
  text: string;
  author: string;
  timestamp: number;
  position?: [number, number, number];
}

interface CADState {
  // Objects
  objects: CADObject[];
  selectedIds: Set<string>;
  
  // Tools
  activeTool: ToolType;
  activeTab: 'SOLID' | 'SURFACE' | 'MESH' | 'SHEET' | 'PLASTIC' | 'MANAGE' | 'UTILITIES' | 'SKETCH';
  isSketchMode: boolean;
  
  // View
  currentView: ViewType;
  zoom: number;
  gridVisible: boolean;
  
  // History
  history: HistoryItem[];
  historyIndex: number;
  
  // File
  fileName: string;
  isSaved: boolean;
  
  // Comments
  comments: Comment[];
  commentsExpanded: boolean;
  
  // UI
  searchOpen: boolean;
  settingsOpen: boolean;
  helpOpen: boolean;
  notificationsOpen: boolean;
  
  // Actions - Objects
  addObject: (type: CADObject['type'], options?: Partial<CADObject>) => void;
  updateObject: (id: string, updates: Partial<CADObject>) => void;
  deleteObject: (id: string) => void;
  selectObject: (id: string, multiSelect?: boolean) => void;
  clearSelection: () => void;
  duplicateSelected: () => void;
  
  // Actions - Tools
  setActiveTool: (tool: ToolType) => void;
  setActiveTab: (tab: CADState['activeTab']) => void;
  enterSketchMode: () => void;
  exitSketchMode: () => void;
  
  // Actions - View
  setView: (view: ViewType) => void;
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;
  fitToScreen: () => void;
  
  // Actions - History
  undo: () => void;
  redo: () => void;
  goToHistoryIndex: (index: number) => void;
  skipToStart: () => void;
  skipToEnd: () => void;
  stepBack: () => void;
  stepForward: () => void;
  
  // Actions - File
  save: () => void;
  saveAs: (name: string) => void;
  open: () => void;
  reset: () => void;
  setFileName: (name: string) => void;
  
  // Actions - Comments
  addComment: (text: string, position?: [number, number, number]) => void;
  deleteComment: (id: string) => void;
  toggleComments: () => void;
  
  // Actions - UI
  toggleSearch: () => void;
  toggleSettings: () => void;
  toggleHelp: () => void;
  toggleNotifications: () => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const DEFAULT_COLORS = ['#6090c0', '#c06060', '#60c060', '#c0c060', '#c060c0', '#60c0c0'];
let colorIndex = 0;
const getNextColor = () => {
  const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
  colorIndex++;
  return color;
};

const getDefaultDimensions = (type: CADObject['type']): Record<string, number> => {
  switch (type) {
    case 'box': return { width: 10, height: 10, depth: 10 };
    case 'cylinder': return { radius: 5, height: 15 };
    case 'sphere': return { radius: 5 };
    case 'torus': return { radius: 8, tube: 2 };
    case 'coil': return { radius: 5, height: 20, turns: 5 };
    default: return {};
  }
};

export const useCADStore = create<CADState>((set, get) => ({
  // Initial state
  objects: [],
  selectedIds: new Set(),
  activeTool: 'select',
  activeTab: 'SOLID',
  isSketchMode: false,
  currentView: 'home',
  zoom: 100,
  gridVisible: true,
  history: [],
  historyIndex: -1,
  fileName: 'Untitled',
  isSaved: true,
  comments: [],
  commentsExpanded: false,
  searchOpen: false,
  settingsOpen: false,
  helpOpen: false,
  notificationsOpen: false,

  // Object actions
  addObject: (type, options = {}) => {
    const state = get();
    const id = generateId();
    const count = state.objects.filter(o => o.type === type).length + 1;
    
    const newObject: CADObject = {
      id,
      name: options.name || `${type.charAt(0).toUpperCase() + type.slice(1)}${count}`,
      type,
      position: options.position || [0, 5, 0],
      rotation: options.rotation || [0, 0, 0],
      scale: options.scale || [1, 1, 1],
      dimensions: options.dimensions || getDefaultDimensions(type),
      color: options.color || getNextColor(),
      visible: true,
      selected: false,
    };

    const historyItem: HistoryItem = {
      id: generateId(),
      type: 'create',
      name: `Create ${newObject.name}`,
      timestamp: Date.now(),
      objectIds: [id],
    };

    set({
      objects: [...state.objects, newObject],
      history: [...state.history.slice(0, state.historyIndex + 1), historyItem],
      historyIndex: state.historyIndex + 1,
      isSaved: false,
      activeTool: 'select',
    });
  },

  updateObject: (id, updates) => {
    const state = get();
    const objectIndex = state.objects.findIndex(o => o.id === id);
    if (objectIndex === -1) return;

    const previousState = [{ ...state.objects[objectIndex] }];
    const updatedObjects = [...state.objects];
    updatedObjects[objectIndex] = { ...updatedObjects[objectIndex], ...updates };

    const historyItem: HistoryItem = {
      id: generateId(),
      type: 'modify',
      name: `Modify ${state.objects[objectIndex].name}`,
      timestamp: Date.now(),
      objectIds: [id],
      previousState,
    };

    set({
      objects: updatedObjects,
      history: [...state.history.slice(0, state.historyIndex + 1), historyItem],
      historyIndex: state.historyIndex + 1,
      isSaved: false,
    });
  },

  deleteObject: (id) => {
    const state = get();
    const obj = state.objects.find(o => o.id === id);
    if (!obj) return;

    const historyItem: HistoryItem = {
      id: generateId(),
      type: 'delete',
      name: `Delete ${obj.name}`,
      timestamp: Date.now(),
      objectIds: [id],
      previousState: [obj],
    };

    set({
      objects: state.objects.filter(o => o.id !== id),
      selectedIds: new Set([...state.selectedIds].filter(sid => sid !== id)),
      history: [...state.history.slice(0, state.historyIndex + 1), historyItem],
      historyIndex: state.historyIndex + 1,
      isSaved: false,
    });
  },

  selectObject: (id, multiSelect = false) => {
    const state = get();
    const newSelected = new Set(multiSelect ? state.selectedIds : []);
    
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }

    const updatedObjects = state.objects.map(obj => ({
      ...obj,
      selected: newSelected.has(obj.id),
    }));

    set({ objects: updatedObjects, selectedIds: newSelected });
  },

  clearSelection: () => {
    const state = get();
    const updatedObjects = state.objects.map(obj => ({ ...obj, selected: false }));
    set({ objects: updatedObjects, selectedIds: new Set() });
  },

  duplicateSelected: () => {
    const state = get();
    const selectedObjects = state.objects.filter(o => state.selectedIds.has(o.id));
    
    const newObjects: CADObject[] = selectedObjects.map(obj => ({
      ...obj,
      id: generateId(),
      name: `${obj.name}_copy`,
      position: [obj.position[0] + 5, obj.position[1], obj.position[2] + 5] as [number, number, number],
      selected: false,
    }));

    if (newObjects.length > 0) {
      const historyItem: HistoryItem = {
        id: generateId(),
        type: 'create',
        name: `Duplicate ${newObjects.length} object(s)`,
        timestamp: Date.now(),
        objectIds: newObjects.map(o => o.id),
      };

      set({
        objects: [...state.objects, ...newObjects],
        history: [...state.history.slice(0, state.historyIndex + 1), historyItem],
        historyIndex: state.historyIndex + 1,
        isSaved: false,
      });
    }
  },

  // Tool actions
  setActiveTool: (tool) => set({ activeTool: tool }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  enterSketchMode: () => {
    const state = get();
    const historyItem: HistoryItem = {
      id: generateId(),
      type: 'sketch',
      name: 'Start Sketch',
      timestamp: Date.now(),
      objectIds: [],
    };

    set({
      isSketchMode: true,
      activeTab: 'SKETCH',
      activeTool: 'line',
      history: [...state.history.slice(0, state.historyIndex + 1), historyItem],
      historyIndex: state.historyIndex + 1,
      isSaved: false,
    });
  },
  
  exitSketchMode: () => set({ isSketchMode: false, activeTab: 'SOLID', activeTool: 'select' }),

  // View actions
  setView: (view) => set({ currentView: view }),
  setZoom: (zoom) => set({ zoom: Math.max(10, Math.min(500, zoom)) }),
  toggleGrid: () => set(state => ({ gridVisible: !state.gridVisible })),
  fitToScreen: () => set({ zoom: 100, currentView: 'home' }),

  // History actions
  undo: () => {
    const state = get();
    if (state.historyIndex < 0) return;

    const historyItem = state.history[state.historyIndex];
    let newObjects = [...state.objects];

    if (historyItem.type === 'create') {
      newObjects = newObjects.filter(o => !historyItem.objectIds.includes(o.id));
    } else if (historyItem.type === 'delete' && historyItem.previousState) {
      newObjects = [...newObjects, ...historyItem.previousState];
    } else if (historyItem.type === 'modify' && historyItem.previousState) {
      historyItem.previousState.forEach(prev => {
        const idx = newObjects.findIndex(o => o.id === prev.id);
        if (idx !== -1) newObjects[idx] = prev;
      });
    } else if (historyItem.type === 'sketch') {
      set({ isSketchMode: false });
    }

    set({ objects: newObjects, historyIndex: state.historyIndex - 1, isSaved: false });
  },

  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;

    const historyItem = state.history[state.historyIndex + 1];
    let newObjects = [...state.objects];

    if (historyItem.type === 'create') {
      // Re-add deleted objects from future create operations
      // For simplicity, we'll just update the index
    } else if (historyItem.type === 'sketch') {
      set({ isSketchMode: true });
    }

    set({ historyIndex: state.historyIndex + 1, isSaved: false });
  },

  goToHistoryIndex: (index) => set({ historyIndex: Math.max(-1, Math.min(get().history.length - 1, index)) }),
  skipToStart: () => set({ historyIndex: -1 }),
  skipToEnd: () => set(state => ({ historyIndex: state.history.length - 1 })),
  stepBack: () => get().undo(),
  stepForward: () => get().redo(),

  // File actions
  save: () => {
    const state = get();
    const data = {
      objects: state.objects,
      fileName: state.fileName,
      savedAt: Date.now(),
    };
    localStorage.setItem(`cad_file_${state.fileName}`, JSON.stringify(data));
    set({ isSaved: true });
    console.log('Project saved:', state.fileName);
  },

  saveAs: (name) => {
    set({ fileName: name });
    get().save();
  },

  open: () => {
    // In a real app, this would open a file dialog
    const files = Object.keys(localStorage).filter(k => k.startsWith('cad_file_'));
    if (files.length > 0) {
      const data = JSON.parse(localStorage.getItem(files[0]) || '{}');
      if (data.objects) {
        set({
          objects: data.objects,
          fileName: data.fileName || 'Loaded File',
          isSaved: true,
          history: [],
          historyIndex: -1,
        });
      }
    }
    console.log('Open file dialog (simulated)');
  },

  reset: () => {
    set({
      objects: [],
      selectedIds: new Set(),
      history: [],
      historyIndex: -1,
      isSaved: true,
      isSketchMode: false,
      activeTool: 'select',
      activeTab: 'SOLID',
    });
  },

  setFileName: (name) => set({ fileName: name, isSaved: false }),

  // Comment actions
  addComment: (text, position) => {
    const state = get();
    const comment: Comment = {
      id: generateId(),
      text,
      author: 'User',
      timestamp: Date.now(),
      position,
    };
    set({ comments: [...state.comments, comment] });
  },

  deleteComment: (id) => set(state => ({ comments: state.comments.filter(c => c.id !== id) })),
  toggleComments: () => set(state => ({ commentsExpanded: !state.commentsExpanded })),

  // UI actions
  toggleSearch: () => set(state => ({ searchOpen: !state.searchOpen })),
  toggleSettings: () => set(state => ({ settingsOpen: !state.settingsOpen })),
  toggleHelp: () => set(state => ({ helpOpen: !state.helpOpen })),
  toggleNotifications: () => set(state => ({ notificationsOpen: !state.notificationsOpen })),
}));

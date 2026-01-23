import { create } from 'zustand';
import * as THREE from 'three';
import { initCAD, makeBoxHelper, replicadToThreeGeometry, createSketchHelper, createSketchFromPrimitives } from '../lib/cad-kernel';

const shapeRegistry = new Map<string, any>(); // Stores WASM objects

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
  geometry?: THREE.BufferGeometry;
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

export interface SketchPrimitive {
  id: string;
  type: 'line' | 'rectangle' | 'circle' | 'arc' | 'polygon' | 'spline';
  points: [number, number][]; // Standardized points: Line [p1...pn], Rect [p1, p2], Circle [center, edge]
  properties?: {
    sides?: number; // For polygon
  };
}

interface CADState {
  // Objects
  objects: CADObject[];
  selectedIds: Set<string>;

  // Tools
  activeTool: ToolType;
  activeTab: 'SOLID' | 'SURFACE' | 'MESH' | 'SHEET' | 'PLASTIC' | 'MANAGE' | 'UTILITIES' | 'SKETCH';
  isSketchMode: boolean;

  // Sketch State
  sketchPlane: 'XY' | 'XZ' | 'YZ' | null;
  sketchStep: 'select-plane' | 'drawing';
  activeSketchPrimitives: SketchPrimitive[];
  // Used for the primitive actively being drawn (dragged/interacted with)
  currentDrawingPrimitive: SketchPrimitive | null;

  // Deprecated/Legacy
  sketchPoints: [number, number][];

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

  // Actions - Sketch
  addSketchPoint: (point: [number, number]) => void;
  setSketchPlane: (plane: 'XY' | 'XZ' | 'YZ') => void;
  addSketchPrimitive: (primitive: SketchPrimitive) => void;
  updateCurrentDrawingPrimitive: (primitive: SketchPrimitive | null) => void;
  exitSketchMode: () => void;
  finishSketch: () => void;
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
  sketchPlane: null,
  sketchStep: 'select-plane',
  activeSketchPrimitives: [],
  currentDrawingPrimitive: null,
  sketchPoints: [],
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
  addObject: async (type, options = {}) => {
    try {
      await initCAD();
    } catch (e) {
      console.error("Failed to initialize CAD kernel:", e);
      return;
    }

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

    if (type === 'box') {
      try {
        console.log('Creating box with dimensions:', newObject.dimensions);
        const { width, height, depth } = newObject.dimensions;
        // Call the kernel
        const shape = makeBoxHelper(width, height, depth);

        // Store the raw B-Rep shape if needed
        shapeRegistry.set(id, shape);

        // Convert to mesh (Tesselation)
        const geometry = replicadToThreeGeometry(shape);
        newObject.geometry = geometry;

        console.log('Box created successfully, geometry:', geometry);
      } catch (e) {
        console.error("Failed to create box via replicad kernel:", e);
        // Fallback or alert user?
      }
    }

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

  // Sketch Actions
  setSketchPlane: (plane) => set({ sketchPlane: plane, sketchStep: 'drawing' }),

  addSketchPoint: (point) => set(state => ({ sketchPoints: [...state.sketchPoints, point] })),

  addSketchPrimitive: (primitive) => set(state => ({
    activeSketchPrimitives: [...state.activeSketchPrimitives, primitive]
  })),

  updateCurrentDrawingPrimitive: (primitive) => set({ currentDrawingPrimitive: primitive }),

  clearSketch: () => set({ sketchPoints: [], activeSketchPrimitives: [], currentDrawingPrimitive: null }),

  enterSketchMode: () => {
    const state = get();
    // Start with plane selection
    const historyItem: HistoryItem = {
      id: generateId(),
      type: 'sketch',
      name: 'Start Sketch',
      timestamp: Date.now(),
      objectIds: [],
    };

    set({
      isSketchMode: true,
      sketchStep: 'select-plane',
      sketchPlane: null,
      activeTab: 'SKETCH',
      activeTool: 'line',
      activeSketchPrimitives: [],
      currentDrawingPrimitive: null,
      sketchPoints: [],
      history: [...state.history.slice(0, state.historyIndex + 1), historyItem],
      historyIndex: state.historyIndex + 1,
      isSaved: false,
    });
  },

  exitSketchMode: () => {
    set({
      isSketchMode: false,
      sketchPoints: [],
      activeSketchPrimitives: [],
      currentDrawingPrimitive: null,
      sketchPlane: null,
      activeTab: 'SOLID',
      activeTool: 'select'
    });
  },

  finishSketch: () => {
    const state = get();
    // Support both legacy points and new primitives
    const hasPoints = state.sketchPoints.length >= 2;
    const hasPrimitives = state.activeSketchPrimitives.length > 0;

    if (!hasPoints && !hasPrimitives) {
      set({
        isSketchMode: false,
        sketchPoints: [],
        activeSketchPrimitives: [],
        currentDrawingPrimitive: null,
        sketchPlane: null,
        activeTab: 'SOLID',
        activeTool: 'select'
      });
      return;
    }

    try {
      const id = generateId();
      let geometry: THREE.BufferGeometry | null = null;
      let sketchObjectName = `Sketch${state.objects.length + 1}`;

      // 1. Legacy Points Path
      if (hasPoints && !hasPrimitives) {
        const sketch = createSketchHelper(state.sketchPoints, true);
        if (sketch) geometry = replicadToThreeGeometry(sketch);
      }
      // 2. Primitives Path
      else if (hasPrimitives) {
        const shape = createSketchFromPrimitives(state.activeSketchPrimitives);
        if (shape) geometry = replicadToThreeGeometry(shape);
      }

      const newObject: CADObject = {
        id,
        name: sketchObjectName,
        type: 'sketch',
        position: [0, 0, 0], // In future, use sketchPlane transform
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        dimensions: {},
        color: getNextColor(),
        visible: true,
        selected: false,
        geometry: geometry
      };

      const historyItem: HistoryItem = {
        id: generateId(),
        type: 'create',
        name: `Create Sketch`,
        timestamp: Date.now(),
        objectIds: [id],
      };

      set({
        objects: [...state.objects, newObject],
        history: [...state.history.slice(0, state.historyIndex + 1), historyItem],
        historyIndex: state.historyIndex + 1,
        isSaved: false,
        isSketchMode: false,
        sketchPoints: [],
        activeSketchPrimitives: [],
        currentDrawingPrimitive: null,
        sketchPlane: null,
        activeTab: 'SOLID',
        activeTool: 'select'
      });

    } catch (e) {
      console.error("Error creating sketch object:", e);
    }
  },

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

import { create } from 'zustand';
import * as THREE from 'three';
import { initCAD, makeBoxHelper, makeCylinderHelper, makeSphereHelper, replicadToThreeGeometry, createSketchHelper, createSketchFromPrimitives } from '../lib/cad-kernel';
import * as replicad from 'replicad';
import { toast } from 'sonner';

const DEFAULT_CODE = `const { drawEllipse, makeBox, makeCylinder } = replicad;
const main = () => {
  let shapes = [];
  shapes.push(drawEllipse(20, 30).sketchOnPlane().extrude(50).fillet(2));
  return shapes;
};`;

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
  type: 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil' | 'sketch' | 'extrusion' | 'revolve';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  dimensions: Record<string, any>;
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
  // Dynamic Sketch Input
  lockedValues: Record<string, number | null>;

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

  // Operation State
  activeOperation: {
    type: string;
    params: any;
  } | null;

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
  setSketchInputLock: (key: string, value: number | null) => void;
  clearSketchInputLocks: () => void;

  // Actions - Operations
  startOperation: (type: string) => void;
  updateOperationParams: (params: any) => void;
  cancelOperation: () => void;
  applyOperation: () => void;

  // Code Editor
  code: string;
  setCode: (code: string) => void;
  runCode: () => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);


const DEFAULT_COLORS = ['#6090c0', '#c06060', '#60c060', '#c0c060', '#c060c0', '#60c0c0'];
let colorIndex = 0;
const getNextColor = () => {
  const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
  colorIndex++;
  return color;
};

const getDefaultDimensions = (type: CADObject['type']): Record<string, any> => {
  switch (type) {
    case 'box': return { width: 10, height: 10, depth: 10 };
    case 'cylinder': return { radius: 5, height: 15 };
    case 'sphere': return { radius: 5 };
    case 'torus': return { radius: 8, tube: 2 };
    case 'coil': return { radius: 5, height: 20, turns: 5 };
    case 'extrusion': return { distance: 10, twistAngle: 0, endFactor: 1, profile: 'linear' };
    case 'revolve': return { angle: 360 };
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
  lockedValues: {},
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
  activeOperation: null,
  code: DEFAULT_CODE,

  // Object actions
  // Code-First Object actions
  addObject: async (type, options = {}) => {
    try {
      await initCAD();
    } catch (e) {
      console.error("Failed to initialize CAD kernel:", e);
      return;
    }

    const currentState = get();
    // Generate Code Snippet
    let snippet = "";

    if (type === 'box') {
      const { width, height, depth } = options.dimensions || { width: 10, height: 10, depth: 10 };
      snippet = `shapes.push(replicad.makeBox(${width}, ${height}, ${depth}));`;
    } else if (type === 'cylinder') {
      const { radius, height } = options.dimensions || { radius: 5, height: 15 };
      snippet = `shapes.push(replicad.makeCylinder(${radius}, ${height}));`;
    } else if (type === 'sphere') {
      const { radius } = options.dimensions || { radius: 10 };
      snippet = `shapes.push(replicad.makeSphere(${radius}));`;
    } else if (type === 'torus') {
      // Replicad API for Torus is likely makeTorus(major, minor)
      const { radius, tube } = options.dimensions || { radius: 10, tube: 2 };
      snippet = `shapes.push(replicad.makeTorus(${radius}, ${tube}));`;
    }

    if (snippet) {
      // Parse current code to find insertion point
      let newCode = currentState.code;
      // Simple insertion before "return shapes;" or at end of main
      // We assume strict structure for now or just append to main

      const returnIndex = newCode.lastIndexOf("return shapes;");
      if (returnIndex !== -1) {
        newCode = newCode.slice(0, returnIndex) + "  " + snippet + "\n  " + newCode.slice(returnIndex);
      } else {
        // Fallback if structure is broken, append to end of main? tricky.
        // Let's just regex replace the end of function
        newCode = newCode.replace(/};$/, `  ${snippet}\n  return shapes;\n};`);
      }

      set({ code: newCode });

      // Run code immediately (or let the effect handle it)
      // get().runCode(); 
    }
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
    // ... complete implementation kept from previous context
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
        if (shape) {
          geometry = replicadToThreeGeometry(shape);
          shapeRegistry.set(id, shape);
        }
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
        activeTool: 'select',
        lockedValues: {}
      });

    } catch (e) {
      console.error("Error creating sketch object:", e);
    }
  },

  setSketchInputLock: (key, value) => {
    set(state => ({
      lockedValues: { ...state.lockedValues, [key]: value }
    }));
  },

  clearSketchInputLocks: () => set({ lockedValues: {} }),


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

  // Missing Implementations (added to fix lint)
  setView: (view) => set({ currentView: view }),
  setZoom: (zoom) => set({ zoom }),
  toggleGrid: () => set(state => ({ gridVisible: !state.gridVisible })),
  fitToScreen: () => console.log("fitToScreen not implemented"),

  undo: () => set(state => {
    if (state.historyIndex <= 0) return {};
    const newIndex = state.historyIndex - 1;
    // Real undo logic would restore state here
    return { historyIndex: newIndex, isSaved: false };
  }),
  redo: () => set(state => {
    if (state.historyIndex >= state.history.length - 1) return {};
    return { historyIndex: state.historyIndex + 1, isSaved: false };
  }),
  goToHistoryIndex: (index) => set({ historyIndex: index }),
  skipToStart: () => set({ historyIndex: -1 }),
  skipToEnd: () => set(state => ({ historyIndex: state.history.length - 1 })),
  stepBack: () => console.log("stepBack"),
  stepForward: () => console.log("stepForward"),

  save: () => set({ isSaved: true }),
  saveAs: (name) => set({ fileName: name, isSaved: true }),
  open: () => console.log("open"),
  reset: () => set({ objects: [], history: [], historyIndex: -1 }),
  setFileName: (name) => set({ fileName: name }),


  // Operation actions
  startOperation: (type) => {
    const params = getDefaultDimensions(type as any);
    set({ activeOperation: { type, params } });
  },

  updateOperationParams: (params) => {
    set(state => ({
      activeOperation: state.activeOperation
        ? { ...state.activeOperation, params: { ...state.activeOperation.params, ...params } }
        : null
    }));
  },

  cancelOperation: () => set({ activeOperation: null }),

  applyOperation: () => {
    const state = get();
    if (!state.activeOperation) return;

    const { type, params } = state.activeOperation;

    // Call addObject with the collected parameters
    // We treat params as dimensions/options
    state.addObject(type as any, { dimensions: params });

    set({ activeOperation: null });
  },

  setCode: (code) => set({ code }),

  runCode: async () => {
    const state = get();
    try {
      await initCAD();

      // Execute code
      // We expect the user to define a function 'main' or return a shape
      // We wrap it to return the result of 'main()' if defined, or the last expression

      const evaluator = new Function('replicad', state.code + "\nreturn main();");
      const result = evaluator(replicad);

      let shapesArray: any[] = [];
      if (Array.isArray(result)) {
        shapesArray = result;
      } else if (result && typeof result === 'object') {
        if (result.shape) {
          // Handle { shape: ..., name: ... } pattern
          shapesArray = [result];
        } else if (result.mesh) {
          // Handle single Shape object (duck typing check for .mesh or similar)
          shapesArray = [result];
        } else {
          // Maybe it's a generic object but not a shape? 
          // Try treating it as a shape, if it fails, we catch error below
          shapesArray = [result];
        }
      } else if (result) {
        shapesArray = [result];
      }

      const newObjects: CADObject[] = shapesArray.map((item, index) => {
        const shape = item.shape || item;
        const name = item.name || `Shape ${index + 1}`;
        const id = `shape-${index}`;

        let geometry = null;
        try {
          geometry = replicadToThreeGeometry(shape);
        } catch (err) {
          console.error(`Failed to convert shape ${index} to geometry:`, err);
        }

        return {
          id,
          name,
          type: "sketch" as const,
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          dimensions: {},
          color: item.color || getNextColor(),
          visible: true,
          selected: false,
          geometry: geometry || undefined
        };
      }).filter(obj => obj.geometry !== undefined);

      set({ objects: newObjects });
      console.log(`Code execution finished. Generated ${newObjects.length} objects.`);

    } catch (e: any) {
      console.error("Error executing code:", e);
      toast.error(`Error: ${e.message}`);
    }
  },
}));

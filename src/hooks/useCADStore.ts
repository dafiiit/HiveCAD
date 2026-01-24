import { create } from 'zustand';
import * as THREE from 'three';
import { initCAD, replicadToThreeGeometry, replicadToThreeEdges, createSketchHelper, createSketchFromPrimitives } from '../lib/cad-kernel';
import * as replicad from 'replicad';
import { toast } from 'sonner';
import { CodeManager } from '../lib/code-manager';

const DEFAULT_CODE = `
const main = () => {
  const sphere = replicad.makeSphere(10);
  return sphere;
};`;

const shapeRegistry = new Map<string, any>(); // Stores WASM objects

// Types
export type ToolType =
  | 'select' | 'pan' | 'orbit'
  | 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil'
  | 'sketch'
  // Line tools
  | 'line' | 'vline' | 'hline' | 'polarline' | 'tangentline' | 'movePointer'
  // Arc tools
  | 'threePointsArc' | 'tangentArc' | 'ellipse' | 'sagittaArc'
  // Spline tools
  | 'bezier' | 'quadraticBezier' | 'cubicBezier' | 'smoothSpline'
  // Shape wrappers (Drawing helpers)
  | 'rectangle' | 'circle' | 'polygon' | 'roundedRectangle' | 'text'
  // Plane operations
  | 'plane' | 'pivot' | 'translatePlane' | 'makePlane'
  // Modifications
  | 'move' | 'rotate' | 'scale' | 'copy'
  | 'trim' | 'join' | 'cut' | 'intersect'
  | 'measure' | 'dimension' | 'constrain'
  | 'axis' | 'point';

export type ViewType = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'home' | 'isometric';

export interface CADObject {
  id: string;
  name: string;
  type: 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil' | 'sketch' | 'extrusion' | 'revolve' | 'plane';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  dimensions: Record<string, any>;
  color: string;
  visible: boolean;
  selected: boolean;
  geometry?: THREE.BufferGeometry;
  edgeGeometry?: THREE.BufferGeometry;
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
  type: 'line' | 'vline' | 'hline' | 'polarline' | 'tangentline' | 'movePointer'
  | 'threePointsArc' | 'tangentArc' | 'ellipse' | 'sagittaArc'
  | 'bezier' | 'quadraticBezier' | 'cubicBezier' | 'smoothSpline'
  | 'rectangle' | 'circle' | 'polygon' | 'roundedRectangle' | 'text'
  | 'arc' | 'spline'; // Keep legacy if needed
  points: [number, number][]; // Standardized points
  properties?: {
    sides?: number; // For polygon
    radius?: number; // For polarline, circle
    angle?: number; // For polarline
    distance?: number; // For tangentline
    xRadius?: number; // For ellipse
    yRadius?: number; // For ellipse
    text?: string; // For text tool
    fontSize?: number;
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
  currentDrawingPrimitive: SketchPrimitive | null;
  lockedValues: Record<string, number | null>;
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
  addObject: (type: CADObject['type'] | string, options?: Partial<CADObject>) => void;
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

const DEFAULT_COLORS = ['#6090c0', '#c06060', '#60c060', '#c0c060', '#c0c060', '#60c0c0'];
let colorIndex = 0;
const getNextColor = () => {
  const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
  colorIndex++;
  return color;
};

const getDefaultDimensions = (type: string): Record<string, any> => {
  switch (type) {
    case 'box': return { width: 10, height: 10, depth: 10 };
    case 'cylinder': return { radius: 5, height: 15 };
    case 'sphere': return { radius: 5 };
    case 'torus': return { radius: 8, tube: 2 };
    case 'coil': return { radius: 5, height: 20, turns: 5 };
    case 'plane': return { plane: 'XY', origin: [0, 0, 0] };
    case 'extrusion': return { distance: 10, twistAngle: 0, endFactor: 1, profile: 'linear' };
    case 'revolve': return { angle: 360 };
    case 'pivot': return { angle: 45, axis: [0, 0, 1] };
    case 'translatePlane': return { x: 0, y: 0, z: 0 };
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
  addObject: async (type, options = {}) => {
    try {
      await initCAD();
    } catch (e) {
      console.error("Failed to initialize CAD kernel:", e);
      return;
    }

    const currentState = get();

    const cm = new CodeManager(currentState.code);
    let newCode = currentState.code;

    if (type === 'box') {
      const { width, height, depth } = options.dimensions || { width: 10, height: 10, depth: 10 };
      cm.addFeature('makeBaseBox', null, [width, depth, height]); // Replicad uses x, y, z usually. makeBaseBox(x, y, z)
    } else if (type === 'cylinder') {
      const { radius, height } = options.dimensions || { radius: 5, height: 15 };
      cm.addFeature('makeCylinder', null, [radius, height]);
    } else if (type === 'sphere') {
      const { radius } = options.dimensions || { radius: 10 };
      cm.addFeature('makeSphere', null, [radius]);
    } else if (type === 'torus') {
      const { radius, tube } = options.dimensions || { radius: 10, tube: 2 };
      // Torus via revolve
      // drawCircle(tube).translate(radius, 0).sketchOnPlane("XZ").revolve()
      const sketchName = cm.addFeature('drawCircle', null, [tube]);
      cm.addOperation(sketchName, 'translate', [radius, 0]);
      cm.addOperation(sketchName, 'sketchOnPlane', ["XZ"]);
      cm.addOperation(sketchName, 'revolve', []);
    } else if (type === 'coil') {
      const { radius, height, turns } = options.dimensions || { radius: 5, height: 20, turns: 5 };
      // Coil via twisted extrusion
      // drawCircle(1).translate(radius, 0).sketchOnPlane("XY").extrude(height, {twistAngle: 360*turns})
      // We assume tube radius is small, say 1 or derived. Let's create a property for tube radius or default.
      const tubeRadius = 1;
      const sketchName = cm.addFeature('drawCircle', null, [tubeRadius]);
      cm.addOperation(sketchName, 'translate', [radius, 0]);
      cm.addOperation(sketchName, 'sketchOnPlane', ["XY"]);
      cm.addOperation(sketchName, 'extrude', [height, { twistAngle: 360 * turns }]);
    } else if (type === 'plane') {
      // makePlane
      // makePlane(plane: "XY"|"XZ"|"YZ", origin)
      const { plane } = options.dimensions || { plane: 'XY' };
      cm.addFeature('makePlane', null, [plane]);
    } else if (type === 'pivot') {
      const selectedId = [...currentState.selectedIds][0];
      if (selectedId) {
        const { angle, axis } = options.dimensions || { angle: 45, axis: [0, 0, 1] };
        cm.addOperation(selectedId, 'pivot', [angle, axis]);
      } else {
        toast.error("No plane selected for pivot");
        return;
      }
    } else if (type === 'translatePlane') {
      const selectedId = [...currentState.selectedIds][0];
      if (selectedId) {
        const { x, y, z } = options.dimensions || { x: 0, y: 0, z: 0 };
        cm.addOperation(selectedId, 'translate', [x, y, z]);
      } else {
        toast.error("No plane selected for translation");
        return;
      }
    } else if (type === 'extrusion') {
      const selectedId = [...currentState.selectedIds][0];
      if (selectedId) {
        const { distance } = options.dimensions || { distance: 10 };
        cm.addOperation(selectedId, 'extrude', [distance]);
      } else {
        toast.error("No sketch selected for extrusion");
        return;
      }
    } else if (type === 'revolve') {
      const selectedId = [...currentState.selectedIds][0];
      if (selectedId) {
        cm.addOperation(selectedId, 'revolve', []);
      } else {
        toast.error("No sketch selected for revolve");
        return;
      }
    }

    set({ code: cm.getCode() });
    get().runCode();

  },

  updateObject: (id, updates) => {
    const state = get();
    // Code First Update
    if (updates.dimensions) {
      const cm = new CodeManager(state.code);

      // Map dimensions to arguments based on type
      // This requires knowing the type of the object which we have in state
      const obj = state.objects.find(o => o.id === id);
      if (!obj) return;

      // Heuristic mapping of properties to arg indices
      // Ideally CodeManager or a Schema would handle this
      // Note: We assume the MAIN creation operation is at the end of the operations list? 
      // CodeManager logic maps innermost to 0. 
      // A creation call like replicad.makeBox is innermost (and only). So index 0.

      const opIndex = 0;

      if (obj.type === 'box') {
        const d = obj.dimensions;
        const newDims = { ...d, ...updates.dimensions };
        cm.updateOperation(id, opIndex, [newDims.width, newDims.height, newDims.depth]);
      } else if (obj.type === 'cylinder') {
        const d = obj.dimensions;
        const newDims = { ...d, ...updates.dimensions };
        cm.updateOperation(id, opIndex, [newDims.radius, newDims.height]);
      } else if (obj.type === 'sphere') {
        const d = obj.dimensions;
        const newDims = { ...d, ...updates.dimensions };
        cm.updateOperation(id, opIndex, [newDims.radius]);
      }

      set({ code: cm.getCode() });
      get().runCode();
      return;
    }

    // Fallback for non-code updates (e.g. name, color - though color could be in code too)
    const objectIndex = state.objects.findIndex(o => o.id === id);
    if (objectIndex === -1) return;

    const updatedObjects = [...state.objects];
    updatedObjects[objectIndex] = { ...updatedObjects[objectIndex], ...updates };
    set({ objects: updatedObjects, isSaved: false });
  },

  deleteObject: (id) => {
    const state = get();
    // Code First Deletion
    const cm = new CodeManager(state.code);
    cm.removeFeature(id);
    const newCode = cm.getCode();

    if (newCode !== state.code) {
      set({ code: newCode });
      get().runCode();
    } else {
      console.warn("Delete via Code First failed (ID not found or not mapped?) - deleting from view only");
      set({
        objects: state.objects.filter(o => o.id !== id),
        selectedIds: new Set([...state.selectedIds].filter(sid => sid !== id)),
        isSaved: false,
      });
    }
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
    // Duplicate in code...
    console.log("Duplicate not implemented in Code First yet");
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
    set({
      isSketchMode: true,
      sketchStep: 'select-plane',
      sketchPlane: null,
      activeTab: 'SKETCH',
      activeTool: 'line',
      activeSketchPrimitives: [],
      currentDrawingPrimitive: null,
      sketchPoints: [],
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
    // Generate Code for Sketch
    const cm = new CodeManager(state.code);

    // Create new sketch variable
    // const sketch1 = replicad.draw();
    let sketchName = '';

    // Check if we are starting with a Shape Wrapper (Rectangle, Circle, etc. from 'draw...')
    const firstPrim = state.activeSketchPrimitives[0];
    const shapeWrappers = ['rectangle', 'circle', 'roundedRectangle', 'polygon', 'text'];

    if (firstPrim && shapeWrappers.includes(firstPrim.type)) {
      // These are standalone creators usually, e.g. drawRectangle(w, h)
      // For now, let's assume if the first one is a shape wrapper, it defines the base.
      // But replicad mix and match is tricky.
      // Simplification: If using shape wrapper, it's the only thing or base.
      if (firstPrim.type === 'rectangle') {
        const [p1, p2] = firstPrim.points;
        const width = Math.abs(p2[0] - p1[0]);
        const height = Math.abs(p2[1] - p1[1]);
        sketchName = cm.addFeature('drawRectangle', null, [width, height]);
        // Translate to center? drawRectangle is centered.
        const centerX = (p1[0] + p2[0]) / 2;
        const centerY = (p1[1] + p2[1]) / 2;
        if (centerX !== 0 || centerY !== 0) {
          cm.addOperation(sketchName, 'translate', [centerX, centerY]);
        }
      } else if (firstPrim.type === 'circle') {
        const [center, edge] = firstPrim.points;
        const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
        sketchName = cm.addFeature('drawCircle', null, [radius]);
        if (center[0] !== 0 || center[1] !== 0) {
          cm.addOperation(sketchName, 'translate', [center[0], center[1]]);
        }
      }
      // ... implement others
    } else {
      // Standard Drawing Chain
      // const sketch1 = replicad.draw(startPoint?);
      let startPoint = state.activeSketchPrimitives[0]?.points[0];
      if (state.activeSketchPrimitives[0]?.type === 'movePointer') {
        startPoint = state.activeSketchPrimitives[0].points[0]; // Logic for movePointer
      }

      if (startPoint) {
        sketchName = cm.addFeature('draw', null, [startPoint[0], startPoint[1]]);
      } else {
        sketchName = cm.addFeature('draw', null, []);
      }

      state.activeSketchPrimitives.forEach(prim => {
        if (prim.type === 'line') {
          const end = prim.points[1];
          cm.addOperation(sketchName, 'lineTo', [end[0], end[1]]);
        } else if (prim.type === 'vline') {
          const end = prim.points[1];
          // Assuming vLineTo(y)
          cm.addOperation(sketchName, 'vLineTo', [end[1]]);
        } else if (prim.type === 'hline') {
          const end = prim.points[1];
          cm.addOperation(sketchName, 'hLineTo', [end[0]]);
        } else if (prim.type === 'polarline') {
          // Point 1 is start (implicit), Point 2 defines vector?
          // Or properties has radius/angle.
          // Assuming we store radius/angle in properties for polar line interaction
          const radius = prim.properties?.radius || 10;
          const angle = prim.properties?.angle || 0;
          cm.addOperation(sketchName, 'polarLine', [radius, angle]);
        } else if (prim.type === 'tangentline') {
          const dist = prim.properties?.distance || 10;
          cm.addOperation(sketchName, 'tangentLine', [dist]);
        } else if (prim.type === 'threePointsArc') {
          const [start, end, mid] = prim.points; // logic might differ on how points are stored
          // .threePointsArcTo(end, mid)
          cm.addOperation(sketchName, 'threePointsArcTo', [[end[0], end[1]], [mid[0], mid[1]]]);
        } else if (prim.type === 'tangentArc') {
          const end = prim.points[1];
          cm.addOperation(sketchName, 'tangentArcTo', [[end[0], end[1]]]);
        } else if (prim.type === 'ellipse') {
          const [start, end] = prim.points;
          const xRadius = prim.properties?.xRadius || 10;
          const yRadius = prim.properties?.yRadius || 5;
          // .ellipseTo([x,y], xRadius, yRadius)
          cm.addOperation(sketchName, 'ellipseTo', [[end[0], end[1]], xRadius, yRadius]);
        } else if (prim.type === 'smoothSpline') {
          // points[1]
          const end = prim.points[1];
          // .smoothSplineTo([x,y], config?)
          cm.addOperation(sketchName, 'smoothSplineTo', [[end[0], end[1]]]);
        } else if (prim.type === 'bezier') {
          // points[1] is end, points[2+] are control?
          const end = prim.points[1];
          const control = prim.points.slice(2);
          // .bezierCurveTo(end, controlPoints)
          cm.addOperation(sketchName, 'bezierCurveTo', [[end[0], end[1]], control]);
        }
      });

      // Close if needed?
      // cm.addOperation(sketchName, 'close', []);

      // Ensure the DrawingPen is finished before sketching on plane
      cm.addOperation(sketchName, 'done', []);
    }

    // Sketch on Plane
    if (state.sketchPlane) {
      cm.addOperation(sketchName, 'sketchOnPlane', [state.sketchPlane]);
    }

    set({
      code: cm.getCode(),
      isSketchMode: false,
      sketchPoints: [],
      activeSketchPrimitives: [],
      currentDrawingPrimitive: null,
      sketchPlane: null,
      activeTab: 'SOLID',
      activeTool: 'select',
      lockedValues: {}
    });

    get().runCode();
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

  // View actions
  setView: (view) => set({ currentView: view }),
  setZoom: (zoom) => set({ zoom }),
  toggleGrid: () => set(state => ({ gridVisible: !state.gridVisible })),
  fitToScreen: () => console.log("fitToScreen"),

  // History - stubbed for now as we rely on Code History?
  undo: () => console.log("Undo"),
  redo: () => console.log("Redo"),
  goToHistoryIndex: () => { },
  skipToStart: () => { },
  skipToEnd: () => { },
  stepBack: () => { },
  stepForward: () => { },

  save: () => set({ isSaved: true }),
  saveAs: (name) => set({ fileName: name, isSaved: true }),
  open: () => { },
  reset: () => set({ objects: [], code: DEFAULT_CODE }),
  setFileName: (name) => set({ fileName: name }),

  // Operations
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
    state.addObject(type as any, { dimensions: params });
    set({ activeOperation: null });
  },

  setCode: (code) => set({ code }),

  runCode: async () => {
    const state = get();
    try {
      await initCAD();

      // 1. Transform Code
      const cm = new CodeManager(state.code);
      const executableCode = cm.transformForExecution();

      // 2. Define Instrumentation
      // This is passed to the Function constructor
      const __record = (uuid: string, shape: any) => {
        if (shape && typeof shape === 'object') {
          // We attach the ID to the shape object itself if possible
          // Replicad objects might be sealed/frozen? usually not.
          try {
            (shape as any)._astId = uuid;
          } catch (e) {
            console.warn("Could not attach ID to shape", e);
          }
        }
        return shape;
      };

      // 3. Execute
      // We expect 'main' to be defined in code.
      // We wrap it.
      const evaluator = new Function('replicad', '__record', executableCode + "\nreturn main();");
      const result = evaluator(replicad, __record);

      let shapesArray: any[] = [];
      if (Array.isArray(result)) {
        // FIX 1: .flat(Infinity) hinzufügen, um verschachtelte Arrays wie [shapes, shape1] zu unterstützen
        shapesArray = result.flat(Infinity);
      } else if (result) {
        shapesArray = [result];
      }

      // 4. Map to CADObjects
      const newObjects: CADObject[] = shapesArray.map((item, index) => {
        const shape = item.shape || item;
        const astId = (shape as any)._astId || `gen-${index}`;

        // Try to keep existing properties (selection, color) if ID matches
        const existing = state.objects.find(o => o.id === astId);

        let geometry = null;
        let edgeGeometry = null;
        try {
          geometry = replicadToThreeGeometry(shape);
          edgeGeometry = replicadToThreeEdges(shape);
        } catch (err) {
          console.error(`Failed to convert shape ${index}`, err);
        }

        // FIX 2: Identify type based on the LAST operation in the chain
        let type: CADObject['type'] = existing?.type || 'box';

        // Find feature by ID (variable name)
        const feature = cm.getFeatures().find(f => f.id === astId);

        if (feature && feature.operations.length > 0) {
          // The last operation usually determines the final state/type
          const lastOp = feature.operations[feature.operations.length - 1];
          const lastOpName = lastOp.name.toLowerCase();

          if (lastOpName.includes('box')) type = 'box';
          else if (lastOpName.includes('cylinder')) type = 'cylinder';
          else if (lastOpName.includes('sphere')) type = 'sphere';
          else if (lastOpName.includes('torus')) type = 'torus';
          else if (lastOpName.includes('extrude')) type = 'extrusion';
          else if (lastOpName.includes('revolve')) type = 'revolve';
          else if (lastOpName.includes('draw') || lastOpName.includes('sketch')) type = 'sketch';
          else if (lastOpName.includes('plane')) type = 'plane';
        }

        return {
          id: astId,
          name: existing?.name || (type === 'extrusion' ? 'Extrusion' : type.charAt(0).toUpperCase() + type.slice(1)) + ' ' + (index + 1),
          type: type as CADObject['type'],
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          dimensions: existing?.dimensions || {},
          color: existing?.color || getNextColor(),
          visible: true,
          selected: existing?.selected || false,
          geometry: geometry || undefined,
          edgeGeometry: edgeGeometry || undefined
        };
      }).filter(obj => (obj.geometry !== undefined || obj.edgeGeometry !== undefined));

      set({ objects: newObjects });
      console.log(`Executed. Objects: ${newObjects.length}`);

    } catch (e: any) {
      console.error("Error executing code:", e);
      toast.error(`Error: ${e.message}`);
    }
  },
}));

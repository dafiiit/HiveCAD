import { create } from 'zustand';
import * as THREE from 'three';
import { initCAD, replicadToThreeGeometry, replicadToThreeEdges, createSketchHelper, createSketchFromPrimitives } from '../lib/cad-kernel';
import * as replicad from 'replicad';
import { toast } from 'sonner';
import { CodeManager } from '../lib/code-manager';
import { toolRegistry } from '../lib/tools';
import { ConstraintSolver, type EntityId, type SketchEntity, type SketchConstraint, type ConstraintType, type SolveResult } from '../lib/solver';
import type { SnapPoint, SnappingEngine } from '../lib/snapping';
import { PlanarGraph } from '../lib/sketch-graph/Graph';
import { GeometryType, LineSegment, ArcSegment, Circle, arcFromThreePoints } from '../lib/sketch-graph/Geometry';

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
  // Legacy arc/spline
  | 'arc' | 'spline'
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
    // Polygon
    sides?: number;
    // Arc/Ellipse - sagitta
    sagitta?: number;
    // Circle radius
    radius?: number;
    // Polar line
    angle?: number;
    distance?: number;
    // Line deltas
    dx?: number;
    dy?: number;
    // Ellipse
    xRadius?: number;
    yRadius?: number;
    rotation?: number;
    longWay?: boolean;
    counterClockwise?: boolean;
    // Text
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    // Spline tangents
    startTangent?: number;
    endTangent?: number;
    startFactor?: number;
    endFactor?: number;
    // Bezier control points
    ctrlX?: number;
    ctrlY?: number;
    ctrlStartX?: number;
    ctrlStartY?: number;
    ctrlEndX?: number;
    ctrlEndY?: number;
    // General control points array
    controlPoints?: [number, number][];
    // Corner modification
    cornerType?: 'fillet' | 'chamfer';
    // Solver integration
    solverId?: string;
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

  // Sketch State (Legacy primitives-based - will be gradually replaced)
  sketchPlane: 'XY' | 'XZ' | 'YZ' | null;
  sketchStep: 'select-plane' | 'drawing';
  activeSketchPrimitives: SketchPrimitive[];
  currentDrawingPrimitive: SketchPrimitive | null;
  lockedValues: Record<string, number | null>;
  sketchPoints: [number, number][];

  // Constraint Solver State (New entity-based system)
  solverInstance: ConstraintSolver | null;
  sketchEntities: Map<EntityId, SketchEntity>;
  sketchConstraints: SketchConstraint[];
  draggingEntityId: EntityId | null;

  // Snapping State
  activeSnapPoint: SnapPoint | null;
  snappingEnabled: boolean;
  snappingEngine: SnappingEngine | null;


  // View
  currentView: ViewType;
  cameraRotation: { x: number; y: number; z: number } | null;
  cameraQuaternion: [number, number, number, number];
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
  setCameraRotation: (rotation: { x: number; y: number; z: number }) => void;
  setCameraQuaternion: (quaternion: [number, number, number, number]) => void;
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

  // Actions - Constraint Solver
  initializeSolver: () => Promise<void>;
  addSolverPoint: (x: number, y: number, fixed?: boolean) => EntityId | null;
  addSolverLine: (p1Id: EntityId, p2Id: EntityId) => EntityId | null;
  addSolverConstraint: (type: ConstraintType, entityIds: EntityId[], value?: number) => string | null;
  setDrivingPoint: (id: EntityId, x: number, y: number) => void;
  solveConstraints: () => SolveResult | null;
  clearSolver: () => void;
  setDraggingEntity: (id: EntityId | null) => void;
  // Macros
  addSolverLineMacro: (p1: [number, number], p2: [number, number]) => { p1Id: EntityId, p2Id: EntityId, lineId: EntityId } | null;
  addSolverRectangleMacro: (p1: [number, number], p2: [number, number]) => { pointIds: EntityId[], lineIds: EntityId[] } | null;
  addSolverCircleMacro: (p1: [number, number], p2: [number, number]) => { centerId: EntityId, edgeId: EntityId, circleId: EntityId } | null;

  // Actions - Operations

  // Actions - Snapping
  setSnapPoint: (point: SnapPoint | null) => void;
  toggleSnapping: () => void;
  setSnappingEngine: (engine: SnappingEngine) => void;


  // Actions - Operations
  startOperation: (type: string) => void;
  updateOperationParams: (params: any) => void;
  cancelOperation: () => void;
  applyOperation: () => void;

  // Code Editor
  code: string;
  setCode: (code: string) => void;
  runCode: () => void;

  // Boolean Operations
  executeOperation: (type: 'join' | 'cut' | 'intersect') => void;
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
  // Use tool registry for defaults
  const registryDefaults = toolRegistry.getDefaultParams(type);
  if (Object.keys(registryDefaults).length > 0) {
    return registryDefaults;
  }
  // Legacy fallback for types not yet in registry
  switch (type) {
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
  cameraRotation: { x: -0.4, y: -0.6, z: 0 }, // Default isometric view - KEEP for legacy/ViewCube reference if needed?
  cameraQuaternion: [0, 0, 0, 1], // Identity by default, will be set on mount
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

  // Constraint Solver State (initial values)
  solverInstance: null,
  sketchEntities: new Map(),
  sketchConstraints: [],
  draggingEntityId: null,

  // Snapping State (initial)
  activeSnapPoint: null,
  snappingEnabled: true,
  snappingEngine: null,

  // Macros (actions, not state, but needed for TS check if missing from initial object return type inference?)
  // Actually, actions don't need to be in the initial state object of `create`, only `set` returns them?
  // But usage of `create<CADState>(...)` means the initial object MUST match CADState?
  // No, `create` takes a state creator. The return of that creator must match.
  // The creator returns { ...initialState, ...actions }.
  // If I defined actions in the interface but not in the return object, TS complains.
  // I need to implement them.
  addSolverLineMacro: (p1, p2) => {
    // Placeholder implementation or actual macro logic
    return null;
  },
  addSolverRectangleMacro: (p1, p2) => {
    return null;
  },
  addSolverCircleMacro: (p1, p2) => {
    return null;
  },


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

    // Get tool from registry
    const tool = toolRegistry.get(type);

    if (tool) {
      // Get params with defaults from registry merged with provided options
      const params = { ...toolRegistry.getDefaultParams(type), ...options.dimensions };

      if (tool.create) {
        // Primitive tools that create new geometry
        tool.create(cm, params);
      } else if (tool.execute) {
        // Operation tools that modify selected objects
        const selectedIds = [...currentState.selectedIds];
        if (selectedIds.length === 0 && ['extrusion', 'revolve', 'pivot', 'translatePlane'].includes(type)) {
          toast.error(`No object selected for ${type}`);
          return;
        }
        tool.execute(cm, selectedIds, params);
      }
    } else {
      // Legacy fallback for types not yet in registry
      console.warn(`Tool "${type}" not found in registry, using legacy implementation`);

      if (type === 'extrusion') {
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

  setCameraQuaternion: (quaternion) => set({ cameraQuaternion: quaternion }),

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
    if (state.activeSketchPrimitives.length === 0) {
      // No primitives, just exit
      set({
        isSketchMode: false,
        sketchPoints: [],
        activeSketchPrimitives: [],
        currentDrawingPrimitive: null,
        sketchPlane: null,
        activeTab: 'SOLID',
        activeTool: 'select',
        lockedValues: {}
      });
      return;
    }

    const cm = new CodeManager(state.code);
    let sketchName = '';

    // Shape wrapper tools that create standalone drawings (Legacy/Special handling)
    // If we have a SINGLE shape wrapper, we might prefer using its native generator for cleaner code
    // UNLESS we want to support boolean interactions between it and others.
    // GUIDANCE: If there's only one primitive and it's a shape wrapper, keep legacy behavior for cleaner code.
    // If there are multiple, or mixed types, use the Graph.
    const shapeWrappers = ['rectangle', 'roundedRectangle', 'circle', 'polygon', 'text'];
    const isSingleShape = state.activeSketchPrimitives.length === 1 && shapeWrappers.includes(state.activeSketchPrimitives[0].type);

    if (isSingleShape) {
      const firstPrim = state.activeSketchPrimitives[0];
      const tool = toolRegistry.get(firstPrim.type);
      if (tool?.createShape && state.sketchPlane) {
        sketchName = tool.createShape(cm, firstPrim, state.sketchPlane);
      } else {
        // Fallback for simple shapes
        if (firstPrim.type === 'rectangle') {
          const [p1, p2] = firstPrim.points;
          const width = Math.abs(p2[0] - p1[0]);
          const height = Math.abs(p2[1] - p1[1]);
          sketchName = cm.addFeature('drawRectangle', null, [width, height]);
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
        if (state.sketchPlane && sketchName) cm.addOperation(sketchName, 'sketchOnPlane', [state.sketchPlane]);
      }
    } else {
      // --- PLANAR GRAPH PROFILE DETECTION ---
      // 1. Initialize Graph
      const graph = new PlanarGraph();

      // 2. Feed Primitives
      state.activeSketchPrimitives.forEach(prim => {
        if (prim.type === 'line') {
          const p1 = { x: prim.points[0][0], y: prim.points[0][1] };
          const p2 = { x: prim.points[1][0], y: prim.points[1][1] };
          graph.addGeometry(new LineSegment(p1, p2));
        } else if (prim.type === 'rectangle') {
          const [p1, p2] = prim.points;
          // Decompose into 4 lines
          const p3 = { x: p2[0], y: p1[1] };
          const p4 = { x: p1[0], y: p2[1] };

          graph.addGeometry(new LineSegment({ x: p1[0], y: p1[1] }, p3)); // Top/Bottom
          graph.addGeometry(new LineSegment(p3, { x: p2[0], y: p2[1] })); // Right
          graph.addGeometry(new LineSegment({ x: p2[0], y: p2[1] }, p4)); // Bottom/Top
          graph.addGeometry(new LineSegment(p4, { x: p1[0], y: p1[1] })); // Left
        } else if (prim.type === 'circle') {
          const [center, edge] = prim.points;
          const radius = Math.sqrt(Math.pow(edge[0] - center[0], 2) + Math.pow(edge[1] - center[1], 2));
          graph.addGeometry(new Circle({ x: center[0], y: center[1] }, radius));
        } else if (['threePointsArc', 'arc'].includes(prim.type) && prim.points.length >= 3) {
          // Arc logic
          const p1 = { x: prim.points[0][0], y: prim.points[0][1] };
          const p2 = { x: prim.points[1][0], y: prim.points[1][1] }; // End
          const p3 = { x: prim.points[2][0], y: prim.points[2][1] }; // Mid/Via
          const arc = arcFromThreePoints(p1, p2, p3);
          if (arc) graph.addGeometry(arc);
        }
        // TODO: Handle Splines, Ellipses etc.
      });

      // 3. Compute Topology
      graph.computeTopology();

      // 4. Find Cycles
      const allCycles = graph.findCycles();

      // Helper to calculate signed area
      // Area > 0 -> CCW (Outer boundary in our graph logic)
      // Area < 0 -> CW (Inner face in our graph logic)
      const calculateSignedArea = (cycle: { edges: any[], direction: boolean[] }) => {
        let area = 0;
        cycle.edges.forEach((edge, i) => {
          const isFwd = cycle.direction[i];
          const p1 = isFwd ? edge.start.point : edge.end.point;
          const p2 = isFwd ? edge.end.point : edge.start.point;
          area += (p1.x * p2.y - p2.x * p1.y);
        });
        return area / 2;
      };

      // Filter for Inner Faces (Area < 0) and Reverse to make them CCW for Replicad
      const cycles = allCycles
        .filter(c => calculateSignedArea(c) < -1e-9) // Filter negative area (CW)
        .map(c => ({
          edges: [...c.edges].reverse(),
          direction: [...c.direction].reverse().map(d => !d) // Reverse direction boolean too (since we walk backwards, fwd becomes bwd)
        }));

      if (cycles.length > 0) {
        // Create a compound shape from these cycles
        sketchName = cm.addFeature('draw', null, []);

        cycles.forEach((cycle, cycleIdx) => {
          // For each cycle, we trace the edges

          // Check direction of first edge (which is now CCW)
          const firstEdge = cycle.edges[0];
          const isForward = cycle.direction[0];
          let currentPoint = isForward ? firstEdge.start.point : firstEdge.end.point;

          if (cycleIdx > 0) {
            cm.addOperation(sketchName, 'movePointer', [currentPoint.x, currentPoint.y]);
          } else {
            cm.addOperation(sketchName, 'movePointer', [currentPoint.x, currentPoint.y]);
          }

          cycle.edges.forEach((edge, i) => {
            const isFwd = cycle.direction[i];

            if (edge.geometry.type === GeometryType.Line) {
              const l = edge.geometry as LineSegment;
              const pEnd = isFwd ? l.end : l.start;
              cm.addOperation(sketchName, 'lineTo', [pEnd.x, pEnd.y]);
              currentPoint = pEnd;
            } else if (edge.geometry.type === GeometryType.Arc) {
              const a = edge.geometry as ArcSegment;
              const pEnd = isFwd ? a.endPoint : a.startPoint;

              const angle1 = Math.atan2(currentPoint.y - a.center.y, currentPoint.x - a.center.x);
              const angle2 = Math.atan2(pEnd.y - a.center.y, pEnd.x - a.center.x);

              const travelCCW = isFwd ? a.ccw : !a.ccw;

              // Calculate midpoint based on travelCCW
              let sweep = angle2 - angle1;
              if (travelCCW) {
                // We want to go CCW from 1 to 2.
                // Sweep should be positive (modulo 2PI).
                if (sweep <= 0) sweep += 2 * Math.PI;
              } else {
                // CW from 1 to 2. Sweep negative.
                if (sweep >= 0) sweep -= 2 * Math.PI;
              }

              const midAngle = angle1 + sweep / 2;
              const viaX = a.center.x + a.radius * Math.cos(midAngle);
              const viaY = a.center.y + a.radius * Math.sin(midAngle);

              cm.addOperation(sketchName, 'threePointsArcTo', [[pEnd.x, pEnd.y], [viaX, viaY]]);

              currentPoint = pEnd;
            }
          });

          cm.addOperation(sketchName, 'close', []);
        });

        // Place on sketch plane if needed
        if (state.sketchPlane && sketchName) {
          cm.addOperation(sketchName, 'sketchOnPlane', [state.sketchPlane]);
        }
      } else {
        // No cycles found - maybe just lines?
        // Fallback to simple draw of all primitives as wires
        toast.error("No closed profiles found. Generating wires.");
        // ... (Existing fallback logic or just clean exit?)
        // For now, let's keep the existing logic as a fallback path?
        // No, let's leave it empty or user just gets nothing but the toast, 
        // prompting them to close their sketch.
      }
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

  // Constraint Solver Actions
  initializeSolver: async () => {
    const state = get();
    if (state.solverInstance?.isInitialized) return;

    const solver = new ConstraintSolver();
    await solver.initialize();
    set({ solverInstance: solver });
  },

  addSolverPoint: (x: number, y: number, fixed = false) => {
    const { solverInstance } = get();
    if (!solverInstance?.isInitialized) {
      console.warn('Solver not initialized');
      return null;
    }

    const id = solverInstance.addPoint(x, y, fixed);
    const entity = solverInstance.getPoint(id);
    if (entity) {
      set(state => ({
        sketchEntities: new Map(state.sketchEntities).set(id, entity)
      }));
    }
    return id;
  },

  addSolverLine: (p1Id: EntityId, p2Id: EntityId) => {
    const { solverInstance } = get();
    if (!solverInstance?.isInitialized) {
      console.warn('Solver not initialized');
      return null;
    }

    const id = solverInstance.addLine(p1Id, p2Id);
    const entity = solverInstance.getLine(id);
    if (entity) {
      set(state => ({
        sketchEntities: new Map(state.sketchEntities).set(id, entity)
      }));
    }
    return id;
  },

  addSolverConstraint: (type: ConstraintType, entityIds: EntityId[], value?: number) => {
    const { solverInstance } = get();
    if (!solverInstance?.isInitialized) {
      console.warn('Solver not initialized');
      return null;
    }

    const id = solverInstance.addConstraint(type, entityIds, value);
    const constraints = solverInstance.getAllConstraints();
    set({ sketchConstraints: constraints });
    return id;
  },

  setDrivingPoint: (id: EntityId, x: number, y: number) => {
    const { solverInstance } = get();
    if (!solverInstance?.isInitialized) return;

    solverInstance.setDrivingPoint(id, x, y);
    set({ draggingEntityId: id });
  },

  solveConstraints: () => {
    const { solverInstance } = get();
    if (!solverInstance?.isInitialized) return null;

    const result = solverInstance.solve();

    if (result.success) {
      // Update local entities from solver
      const entities = new Map<EntityId, SketchEntity>();
      solverInstance.getAllEntities().forEach(entity => {
        entities.set(entity.id, entity);
      });
      set({ sketchEntities: entities });
    }

    return result;
  },

  clearSolver: () => {
    const { solverInstance } = get();
    if (solverInstance) {
      solverInstance.clear();
    }
    set({
      sketchEntities: new Map(),
      sketchConstraints: [],
      draggingEntityId: null
    });
  },

  setDraggingEntity: (id: EntityId | null) => {
    set({ draggingEntityId: id });
    if (id === null) {
      const { solverInstance } = get();
      if (solverInstance) {
        solverInstance.clearAllDrivingPoints();
      }
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

  // View actions
  setView: (view) => set({ currentView: view }),
  setCameraRotation: (rotation) => set({ cameraRotation: rotation }),
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

  // Snapping Actions
  setSnapPoint: (point) => set({ activeSnapPoint: point }),
  toggleSnapping: () => set(state => ({ snappingEnabled: !state.snappingEnabled })),
  setSnappingEngine: (engine) => set({ snappingEngine: engine }),

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

  executeOperation: (type) => {
    const state = get();
    const selectedIds = [...state.selectedIds];

    if (selectedIds.length < 2) {
      toast.error("Select at least 2 objects for this operation");
      return;
    }

    const cm = new CodeManager(state.code);
    const primaryId = selectedIds[0];
    const secondaryIds = selectedIds.slice(1);

    // Map tool names to Replicad methods
    const methodMap = {
      join: 'fuse',
      cut: 'cut',
      intersect: 'intersect'
    };

    const methodName = methodMap[type];

    // 1. Add operation to primary object
    secondaryIds.forEach(id => {
      cm.addOperation(primaryId, methodName, [{ type: 'raw', content: id }]);
    });

    // 2. Consume secondary objects (remove them from being returned in main)
    secondaryIds.forEach(id => {
      cm.removeFeature(id);
    });

    set({ code: cm.getCode() });
    get().runCode();
    toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} operation applied`);
  },
}));

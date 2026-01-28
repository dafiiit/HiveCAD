import * as THREE from 'three';

export interface User {
    id?: string;
    email: string;
    pat?: string | null;
}
import { ConstraintSolver, EntityId, SketchEntity, SketchConstraint, ConstraintType, SolveResult } from '../lib/solver';
import { SnapPoint, SnappingEngine } from '../lib/snapping';
import { AssemblyState, AssemblyComponent, AssemblyMate, ComponentId, MateId, MateType } from '../lib/assembly/types';

export type ToolType =
    | 'select' | 'pan' | 'orbit'
    | 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil'
    | 'sketch'
    // Line tools
    | 'line'
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
    type: 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil' | 'sketch' | 'extrusion' | 'revolve' | 'plane' | 'datumAxis';
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    dimensions: Record<string, any>;
    color: string;
    visible: boolean;
    selected: boolean;
    geometry?: THREE.BufferGeometry;
    edgeGeometry?: THREE.BufferGeometry;
    faceMapping?: { start: number; count: number; faceId: number }[];
    edgeMapping?: { start: number; count: number; edgeId: number }[];
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

export interface VersionCommit {
    id: string;
    message: string;
    timestamp: number;
    author: string;
    branch: string;
    parentId: string | null; // null for initial commit
    snapshot: {
        objects: CADObject[];
        code: string;
        historyIndex: number;
    };
}

export interface SketchPrimitive {
    id: string;
    type: 'line'
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

export interface ObjectSlice {
    objects: CADObject[];
    selectedIds: Set<string>;
    activeTool: ToolType;
    activeTab: 'SOLID' | 'SURFACE' | 'MESH' | 'SHEET' | 'PLASTIC' | 'MANAGE' | 'UTILITIES' | 'SKETCH';
    code: string;
    activeOperation: { type: string; params: any } | null;

    addObject: (type: CADObject['type'] | string, options?: Partial<CADObject>) => void;
    updateObject: (id: string, updates: Partial<CADObject>) => void;
    deleteObject: (id: string) => void;
    selectObject: (id: string, multiSelect?: boolean) => void;
    clearSelection: () => void;
    duplicateSelected: () => void;
    setActiveTool: (tool: ToolType) => void;
    setActiveTab: (tab: ObjectSlice['activeTab']) => void;
    setCode: (code: string) => void;
    runCode: () => Promise<void>;
    executeOperation: (type: 'join' | 'cut' | 'intersect') => void;
    startOperation: (type: string) => void;
    updateOperationParams: (params: any) => void;
    cancelOperation: () => void;
    applyOperation: () => void;
}

export interface ViewSlice {
    isFullscreen: boolean;
    currentView: ViewType;
    cameraRotation: { x: number; y: number; z: number } | null;
    cameraQuaternion: [number, number, number, number];
    zoom: number;
    gridVisible: boolean;
    originVisible: boolean;
    axesVisible: boolean;
    sketchesVisible: boolean;
    bodiesVisible: boolean;
    planeVisibility: {
        XY: boolean;
        XZ: boolean;
        YZ: boolean;
    };
    sketchOptions: { lookAt: boolean };

    projectionMode: 'perspective' | 'orthographic' | 'perspective-with-ortho-faces';
    backgroundMode: 'default' | 'dark' | 'light' | 'blue' | 'studio' | 'nature' | 'city' | 'sunset' | 'warehouse';
    sectionViewEnabled: boolean;
    showMeasurements: boolean;
    fitToScreenSignal?: number;

    setView: (view: ViewType) => void;
    setCameraRotation: (rotation: { x: number; y: number; z: number }) => void;
    setCameraQuaternion: (quaternion: [number, number, number, number]) => void;
    setZoom: (zoom: number) => void;
    toggleGrid: () => void;
    setOriginVisibility: (visible: boolean) => void;
    setAxesVisibility: (visible: boolean) => void;
    setSketchesVisibility: (visible: boolean) => void;
    setBodiesVisibility: (visible: boolean) => void;
    setPlaneVisibility: (plane: 'XY' | 'XZ' | 'YZ', visible: boolean) => void;
    fitToScreen: () => void;
    toggleFullscreen: () => void;
    setProjectionMode: (mode: 'perspective' | 'orthographic' | 'perspective-with-ortho-faces') => void;
    setBackgroundMode: (mode: 'default' | 'dark' | 'light' | 'blue' | 'studio' | 'nature' | 'city' | 'sunset' | 'warehouse') => void;
    toggleSectionView: () => void;
    toggleMeasurements: () => void;
    setSketchOption: (key: 'lookAt', value: boolean) => void;

    // Screenshot capability
    thumbnailCapturer: (() => string | null) | null;
    setThumbnailCapturer: (capturer: () => string | null) => void;
}

export interface VersioningSlice {
    history: HistoryItem[];
    historyIndex: number;
    fileName: string;
    projectId: string | null;
    isSaved: boolean;
    comments: Comment[];
    commentsExpanded: boolean;
    versions: VersionCommit[];
    branches: Map<string, string>;
    currentBranch: string;
    currentVersionId: string | null;
    versionCompareModal: {
        isOpen: boolean;
        versionA: string | null;
        versionB: string | null;
    };
    searchOpen: boolean;
    settingsOpen: boolean;
    helpOpen: boolean;
    notificationsOpen: boolean;
    projectThumbnails: Record<string, string>; // Project name -> base64 image
    isSaving: boolean;
    pendingSave: boolean;
    lastSaveTime: number;
    lastSaveError: string | null;

    undo: () => void;
    redo: () => void;
    goToHistoryIndex: (index: number) => void;
    skipToStart: () => void;
    skipToEnd: () => void;
    stepBack: () => void;
    stepForward: () => void;
    syncToCloud: (force?: boolean) => Promise<void>;
    save: (force?: boolean) => Promise<void>;
    hasUnpushedChanges: boolean;
    syncStatus: 'idle' | 'saving_local' | 'pushing_cloud' | 'error';
    saveToLocal: () => Promise<void>;
    triggerSave: () => void;
    saveAs: (name: string) => void;
    open: () => void;
    reset: () => void;
    setFileName: (name: string) => void;
    setProjectId: (id: string | null) => void;
    closeProject: () => void;
    updateThumbnail: (name: string, thumbnail: string) => void;
    removeThumbnail: (name: string) => void;
    addComment: (text: string, position?: [number, number, number]) => void;
    deleteComment: (id: string) => void;
    toggleComments: () => void;
    toggleSearch: () => void;
    toggleSettings: () => void;
    toggleHelp: () => void;
    toggleNotifications: () => void;
    createVersion: (message: string) => void;
    createBranch: (branchName: string, fromVersionId?: string) => void;
    checkoutVersion: (versionId: string) => void;
    mergeBranch: (branchName: string, targetBranch: string) => void;
    setMainBranch: (versionId: string) => void;
    compareVersions: (versionA: string, versionB: string) => void;
    getVersionTree: () => any;
}

export interface SolverSlice {
    solverInstance: ConstraintSolver | null;
    sketchEntities: Map<EntityId, SketchEntity>;
    sketchConstraints: SketchConstraint[];
    draggingEntityId: EntityId | null;

    initializeSolver: () => Promise<void>;
    addSolverPoint: (x: number, y: number, fixed?: boolean) => EntityId | null;
    addSolverLine: (p1Id: EntityId, p2Id: EntityId) => EntityId | null;
    addSolverConstraint: (type: ConstraintType, entityIds: EntityId[], value?: number) => string | null;
    setDrivingPoint: (id: EntityId, x: number, y: number) => void;
    solveConstraints: () => SolveResult | null;
    clearSolver: () => void;
    setDraggingEntity: (id: EntityId | null) => void;
    applyConstraintToSelection: (type: ConstraintType) => void;
    addSolverLineMacro: (p1: [number, number], p2: [number, number]) => { p1Id: EntityId, p2Id: EntityId, lineId: EntityId } | null;
    addSolverRectangleMacro: (p1: [number, number], p2: [number, number]) => { pointIds: EntityId[], lineIds: EntityId[] } | null;
    addSolverCircleMacro: (p1: [number, number], p2: [number, number]) => { centerId: EntityId, edgeId: EntityId, circleId: EntityId } | null;
}

export interface SketchSlice {
    isSketchMode: boolean;
    sketchPlane: 'XY' | 'XZ' | 'YZ' | null;
    sketchStep: 'select-plane' | 'drawing';
    activeSketchPrimitives: SketchPrimitive[];
    currentDrawingPrimitive: SketchPrimitive | null;
    lockedValues: Record<string, number | null>;
    sketchPoints: [number, number][];

    addSketchPoint: (point: [number, number]) => void;
    setSketchPlane: (plane: 'XY' | 'XZ' | 'YZ') => void;
    addSketchPrimitive: (primitive: SketchPrimitive) => void;
    updateCurrentDrawingPrimitive: (primitive: SketchPrimitive | null) => void;
    exitSketchMode: () => void;
    finishSketch: () => void;
    setSketchInputLock: (key: string, value: number | null) => void;
    clearSketchInputLocks: () => void;
    clearSketch: () => void;
    enterSketchMode: () => void;
}

export interface SnappingSlice {
    activeSnapPoint: SnapPoint | null;
    snappingEnabled: boolean;
    snappingEngine: SnappingEngine | null;

    setSnapPoint: (point: SnapPoint | null) => void;
    toggleSnapping: () => void;
    setSnappingEngine: (engine: SnappingEngine) => void;
}

export interface AssemblySlice {
    assemblyState: AssemblyState;

    addComponent: (partId: string, name?: string) => ComponentId;
    removeComponent: (id: ComponentId) => void;
    updateComponentTransform: (id: ComponentId, transform: THREE.Matrix4) => void;
    setComponentFixed: (id: ComponentId, fixed: boolean) => void;

    addMate: (mate: Omit<AssemblyMate, 'id'>) => MateId;
    removeMate: (id: MateId) => void;
    updateMate: (id: MateId, updates: Partial<AssemblyMate>) => void;

    solveAssembly: () => void;
}

// AuthSlice removed and moved to useGlobalStore

export type CADState = ObjectSlice & ViewSlice & VersioningSlice & SolverSlice & SketchSlice & SnappingSlice;
// export type CADState = ObjectSlice & ViewSlice & VersioningSlice & SolverSlice & SketchSlice & SnappingSlice & AssemblySlice & AuthSlice;

import * as THREE from 'three';

export interface User {
    id?: string;
    email: string;
    pat?: string | null;
}
import { CommitInfo as VCSCommit, SerializedCADObject } from '../lib/storage/types';
import { ConstraintSolver, EntityId, SolverEntity, SketchConstraint, ConstraintType, SolveResult } from '../lib/solver';
import { SnapPoint, SnappingEngine } from '../lib/snapping';
import { AssemblyState, AssemblyComponent, AssemblyMate, ComponentId, MateId, MateType } from '../lib/assembly/types';
import type { SketchObject, SerializedSketch, SketchEntityType, SketchEntityProperties } from '../lib/sketch';

/**
 * Tool identifier — any string registered in the ToolRegistry.
 * Validated at runtime via toolRegistry.has(id).
 */
export type ToolType = string;

export type ViewType = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'home' | 'isometric';

export interface CADObject {
    id: string;
    name: string;
    /** 
     * Object type — the tool ID that created this object.
     * Validated at runtime via the ToolRegistry.
     */
    type: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    dimensions: Record<string, any>;
    color: string;
    visible: boolean;
    selected: boolean;
    geometry?: THREE.BufferGeometry;
    edgeGeometry?: THREE.BufferGeometry;
    vertexGeometry?: THREE.BufferGeometry;
    faceMapping?: { start: number; count: number; faceId: number }[];
    edgeMapping?: { start: number; count: number; edgeId: number }[];

    /**
     * Extension-specific data storage.
     * Each extension stores its data under its extension ID as the key.
     * Example: { "gear-generator": { teeth: 24, module: 2 } }
     */
    extensionData?: Record<string, Record<string, any>>;
}

export interface HistoryItem {
    id: string;
    type: 'create' | 'modify' | 'delete' | 'sketch' | 'initial';
    name: string;
    timestamp: number;
    objects: CADObject[] | SerializedCADObject[];
    code: string;
    selectedIds: string[];
}

export interface Comment {
    id: string;
    text: string;
    author: string;
    timestamp: number;
    position?: [number, number, number];
}

export interface VersionCommit extends VCSCommit {
    // UI-specific fields can be added here
}

export interface SketchPrimitive {
    id: string;
    type: SketchEntityType;
    points: [number, number][];
    properties?: SketchEntityProperties;
}

export interface ObjectSlice {
    objects: CADObject[];
    selectedIds: Set<string>;
    activeTool: ToolType;
    activeTab: 'SOLID' | 'SURFACE' | 'MESH' | 'SHEET' | 'PLASTIC' | 'MANAGE' | 'UTILITIES' | 'SKETCH' | string;
    code: string;
    activeOperation: { type: string; params: any } | null;
    pendingImport: { file: File; type: string; extension: string } | null;
    meshingProgress: { id: string; stage: string; progress: number } | null;

    addObject: (type: CADObject['type'] | string, options?: Partial<CADObject>) => void;
    updateObject: (id: string, updates: Partial<CADObject>) => Promise<void>;
    deleteObject: (id: string) => Promise<void>;
    clearAllObjects: () => void;
    selectObject: (id: string, multiSelect?: boolean) => void;
    clearSelection: () => void;
    duplicateSelected: () => void;
    setActiveTool: (tool: ToolType) => void;
    setActiveTab: (tab: ObjectSlice['activeTab']) => void;
    setCode: (code: string) => void;
    runCode: () => Promise<void>;
    executeOperation: (type: 'join' | 'cut' | 'intersect') => Promise<void>;
    startOperation: (type: string) => void;
    updateOperationParams: (params: any) => void;
    cancelOperation: () => void;
    applyOperation: () => void;
    exportSTL: () => Promise<void>;
    exportSTEP: () => Promise<void>;
    exportJSON: () => void;
    importFile: () => void;
    processImport: (file: File, type: string, extension: string) => Promise<void>;
    confirmImport: () => Promise<void>;
    cancelImport: () => void;
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
    cameraControlsDisabled: boolean;

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
    setCameraControlsDisabled: (disabled: boolean) => void;

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
    fullVersions: VersionCommit[];
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

    pushToHistory: (type: HistoryItem['type'], name: string) => void;
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
    setSearchOpen: (open: boolean) => void;
    toggleSettings: () => void;
    toggleHelp: () => void;
    toggleNotifications: () => void;
    createVersion: (message: string) => void;
    createBranch: (branchName: string) => void;
    checkoutVersion: (target: string) => void;
    mergeBranch: (branchName: string, targetBranch: string) => void;
    setMainBranch: (versionId: string) => void;
    compareVersions: (versionA: string | null, versionB: string | null) => void;
    getVersionTree: () => VCSCommit[] | null;
    hydrateVCS: (repoData: any) => void;
}

export interface SolverSlice {
    solverInstance: ConstraintSolver | null;
    sketchEntities: Map<EntityId, SolverEntity>;
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

    /** All persistent sketches, keyed by sketch ID */
    sketches: Map<string, SketchObject>;
    /** The ID of the sketch currently being edited (or null) */
    activeSketchId: string | null;
    /** Chain mode: auto-start next line from last endpoint */
    chainMode: boolean;
    /** Grid snap size (0 = disabled) */
    gridSnapSize: number;

    addSketchPoint: (point: [number, number]) => void;
    setSketchPlane: (plane: 'XY' | 'XZ' | 'YZ') => void;
    addSketchPrimitive: (primitive: SketchPrimitive) => void;
    updateCurrentDrawingPrimitive: (primitive: SketchPrimitive | null) => void;
    exitSketchMode: () => void;
    finishSketch: () => void;
    setSketchInputLock: (key: string, value: number | null) => void;
    clearSketchInputLocks: () => void;
    clearSketch: () => void;
    enterSketchMode: (sketchId?: string) => void;
    undoLastPrimitive: () => void;
    setChainMode: (enabled: boolean) => void;
    setGridSnapSize: (size: number) => void;
    editSketch: (sketchId: string) => void;
    deleteSketch: (sketchId: string) => void;
    getSerializedSketches: () => SerializedSketch[];
    loadSketches: (sketches: SerializedSketch[]) => void;
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

export interface ToolbarSection {
    id: string;
    label: string;
    toolIds: string[];
}

export interface CustomToolbar {
    id: string;
    name: string;
    sections: ToolbarSection[];
}

export interface ToolbarFolder {
    id: string;
    label: string;
    icon: string;
    toolIds: string[];
}

export interface ToolbarSlice {
    customToolbars: CustomToolbar[];
    activeToolbarId: string | null;
    isEditingToolbar: boolean;
    folders: Record<string, ToolbarFolder>;
    extensionStoreOpen: boolean;
    extensionStoreQuery: string;

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
    setExtensionStoreOpen: (open: boolean) => void;
    setExtensionStoreQuery: (query: string) => void;
}

export type CADState = ObjectSlice & ViewSlice & VersioningSlice & SolverSlice & SketchSlice & SnappingSlice & ToolbarSlice;
// export type CADState = ObjectSlice & ViewSlice & VersioningSlice & SolverSlice & SketchSlice & SnappingSlice & AssemblySlice & AuthSlice;

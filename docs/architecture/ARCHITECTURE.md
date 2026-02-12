# HiveCAD Architecture

> Single source of truth for the codebase structure, design principles, and data flow.  
> Every contributor (human or AI) must read this before modifying the codebase.
> If the architecture is altered it must be reflected in this document

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [System Layers](#2-system-layers)
3. [Directory Structure](#3-directory-structure)
4. [Data Model — Single Source of Truth](#4-data-model--single-source-of-truth)
5. [Tool System](#5-tool-system)
6. [Extension System](#6-extension-system)
7. [Sketch Pipeline](#7-sketch-pipeline)
8. [Code Execution Pipeline](#8-code-execution-pipeline)
9. [Storage & Sync Architecture](#9-storage--sync-architecture)
10. [Store Architecture](#10-store-architecture)
11. [Component Architecture](#11-component-architecture)
12. [Current Violations & Cleanup Roadmap](#12-current-violations--cleanup-roadmap)
13. [Agent-Optimized Architecture & Headless Testing](#13-agent-optimized-architecture--headless-testing)

---

## 1. Design Principles

### P1 — One File, One Responsibility

Every source file has exactly **one reason to exist**. A file exports one tool, one type family, one component, or one service. If a file needs a second heading in its doc-comment, it needs a second file.

**Corollary**: tool definition files contain no rendering code. Rendering code files contain no business logic.

### P2 — Core/Extension Symmetry

Built-in tools and extension tools are **identical in capability**. The core ships a set of tools; extensions add more. There is no special API reserved for core tools. If a core tool can do it, an extension can do it.

**Corollary**: there is exactly one registry (`ToolRegistry`), and all tools — core and extension — register into it via the same `register(tool)` call.

### P3 — Registry-Driven Dispatch (No Hardcoded Tool IDs)

UI components **never** switch on tool IDs. Instead they query the `ToolRegistry` for metadata, UI properties, and behavior methods. Adding a new tool requires zero changes to existing UI components.

**Corollary**: if you write `case 'line':` or `if (tool === 'rectangle')` in a component, you are violating this principle.

### P4 — Single Canonical Data Model

Every concept has exactly **one type definition** in one file. Other files import it; they do not redefine it. There is no "legacy" vs "new" representation of the same entity.

| Concept | Canonical Type | Canonical File |
|---------|---------------|----------------|
| Drawing element | `SketchPrimitive` | `src/store/types.ts` |
| Sketch entity properties | `SketchPrimitive.properties` | `src/store/types.ts` |
| Persisted sketch | `SketchObject` | `src/lib/sketch/types.ts` |
| Tool definition | `Tool` | `src/lib/tools/types.ts` |
| Tool metadata | `ToolMetadata` | `src/lib/tools/types.ts` |
| Tool UI property | `ToolUIProperty` | `src/lib/tools/types.ts` |
| CAD object | `CADObject` | `src/store/types.ts` |
| Topology reference | `StableTopologyId` | `src/lib/topology/StableId.ts` |
| Solver entity | `PointEntity \| LineEntity \| ...` | `src/lib/solver/types.ts` |
| Solver constraint | `SketchConstraint` | `src/lib/solver/types.ts` |

### P5 — Separation of Concerns — Three Layers

```
┌─────────────────────────────────────────────┐
│  COMPONENTS (React + Three.js)              │  ← Rendering & interaction
│  Query the registry. Never contain logic.   │
├─────────────────────────────────────────────┤
│  TOOLS + SERVICES (lib/)                    │  ← Business logic
│  Pure functions + classes. No React.        │
│  Tools define behavior; services execute.   │
├─────────────────────────────────────────────┤
│  STORE (Zustand slices)                     │  ← State management
│  Thin orchestration. Delegates to services. │
└─────────────────────────────────────────────┘
```

**Rules:**
- Components import from `lib/` and `store/`, never the reverse.
- Store slices call service functions from `lib/`; they do not contain algorithms.
- `lib/` modules are pure — no React imports, no store imports (except via dependency injection).

**Exception:** Tool `renderPreview` / `renderAnnotation` / `render3DPreview` methods return `ReactNode`. These are the only place where React + Three.js JSX appears inside `lib/`. Each rendering method must live in a **separate file** from the tool's logic (see Tool File Structure below).

### P6 — Explicit over Implicit

- No module-level mutable singletons (except registries).
- No `any` types unless wrapping an untyped external library.
- No `(string & {})` type widening — use the union, or use `string` with a runtime guard.
- Generated IDs use `crypto.randomUUID()`, not `Math.random()`.

### P7 — Fail Loudly

- If `CodeManager.parse()` fails, throw — don't silently return.
- If a tool is not found in the registry, throw — don't return `undefined`.
- Schema validation errors on extension manifests are user-visible toasts.

---

## 2. System Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                   │
│ ┌─────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────┐ │
│ │  Viewport   │  │  SketchCanvas  │  │  Panels        │  │  Dialogs   │ │
│ │  (3D view)  │  │  (2D sketch)   │  │  (properties,  │  │  (tools,   │ │
│ │             │  │                │  │   browser,     │  │   files)   │ │
│ │             │  │                │  │   timeline)    │  │            │ │
│ └──────┬──────┘  └───────┬────────┘  └───────┬────────┘  └─────┬──────┘ │
│        │                 │                   │                 │        │
│        └─────────────────┼───────────────────┼─────────────────┘        │
│                          │                   │                          │
│                   ┌──────▼───────────────────▼──────┐                   │
│                   │         TOOL REGISTRY           │                   │
│                   │  (single source of tool defs)   │                   │
│                   └──────────────┬──────────────────┘                   │
│                                  │                                      │
│  ┌───────────────────────────────┼───────────────────────────────┐      │
│  │                          LIB LAYER                            │      │
│  │                                                               │      │
│  │  ┌────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐    │      │
│  │  │ Code   │  │ Sketch    │  │ Topology │  │ Constraint   │    │      │
│  │  │Manager │  │ Pipeline  │  │ Engine   │  │ Solver       │    │      │
│  │  └───┬────┘  └─────┬─────┘  └────┬─────┘  └──────┬───────┘    │      │
│  │      │             │             │               │            │      │
│  │      └─────────────┼─────────────┼───────────────┘            │      │
│  │                    │             │                            │      │
│  │             ┌──────▼─────────────▼─────┐                      │      │
│  │             │    Replicad Worker Pool  │                      │      │
│  │             │   (WASM/OpenCascade)     │                      │      │
│  │             └──────────────────────────┘                      │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │                     ZUSTAND STORE                            │       │
│  │  objectSlice │ sketchSlice │ viewSlice │ versioningSlice     │       │
│  │  solverSlice │ snappingSlice │ toolbarSlice                  │       │
│  └──────────────────────────────────────────────────────────────┘       │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │                    PERSISTENCE                               │       │
│  │  StorageManager │ GitHub Remote │ IndexedDB Local │ Supabase │       │
│  └──────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Directory Structure

```
src/
├── main.tsx                          # App entry
├── App.tsx                           # Router + providers
├── index.css                         # Global styles
│
├── store/                            # Zustand state management
│   ├── types.ts                      # ALL store types (CADObject, SketchPrimitive, slice interfaces)
│   ├── createCADStore.ts             # Store factory (composes slices)
│   ├── CADStoreContext.tsx            # React context provider
│   ├── useGlobalStore.ts             # Global store hook
│   ├── useUIStore.ts                 # UI-only state (toolbar, extension store)
│   └── slices/
│       ├── objectSlice.ts            # Object CRUD + code execution orchestration
│       ├── sketchSlice.ts            # Sketch mode state + primitive management
│       ├── viewSlice.ts              # Camera, grid, visibility toggles
│       ├── versioningSlice.ts        # History, undo/redo, file management
│       ├── solverSlice.ts            # Constraint solver bridge
│       ├── snappingSlice.ts          # Snap engine bridge
│       └── toolbarSlice.ts           # Custom toolbar layout
│
├── lib/                              # Business logic (no React imports except tool renderers)
│   ├── code-manager.ts              # AST-based code manipulation (Babel)
│   ├── dependency-graph.ts          # DAG for incremental code execution
│   ├── cad-kernel.ts                # Replicad/WASM initialization
│   ├── interaction-manager.ts       # Selection → parametric reference conversion
│   │
│   ├── tools/                       # ★ Tool system — see §5
│   │   ├── types.ts                 # Tool, ToolMetadata, ToolUIProperty interfaces
│   │   ├── registry.ts              # ToolRegistry class + singleton
│   │   ├── index.ts                 # Auto-registers all core tools
│   │   └── core/                    # Built-in tools (one folder per tool)
│   │       ├── primitive/           # box/, cylinder/, sphere/, torus/, coil/
│   │       ├── sketch/              # line/, arc/, shape/, spline/, construction/
│   │       ├── operation/           # extrusion/, revolve/, pivot/, translate-plane/
│   │       ├── boolean/             # join/, cut/, intersect/
│   │       ├── modify/              # move/, rotate/, scale/, delete/, duplicate/
│   │       ├── construct/           # plane/, axis/, point/
│   │       ├── inspect/             # measure/, analyze/
│   │       ├── configure/           # parameters/, pattern/
│   │       └── navigation/          # select/, pan/, orbit/, sketch/
│   │
│   ├── sketch/                      # Sketch data model + code generation
│   │   ├── types.ts                 # SketchObject, SketchEntityType, serialization
│   │   ├── code-generator.ts        # SketchObject → Replicad code
│   │   ├── rendering.ts             # SketchEntity → display points
│   │   └── index.ts                 # Barrel
│   │
│   ├── sketch-graph/                # Planar graph for profile detection
│   │   ├── Graph.ts                 # PlanarGraph, cycle detection
│   │   └── Geometry.ts              # LineSegment, Arc, intersection math
│   │
│   ├── topology/                    # Persistent topological naming
│   │   ├── StableId.ts              # StableTopologyId, GeneratorLink
│   │   ├── TopologyGraph.ts         # Entity relationship graph
│   │   ├── TopologyTracker.ts       # Operation → topology change recorder
│   │   ├── ReferenceManager.ts      # Face/edge reference storage
│   │   ├── ReferenceResolver.ts     # Resolve references after regen
│   │   ├── ShapeAnalyzer.ts         # OCCT geometry introspection
│   │   ├── SketchTopologyBridge.ts  # Sketch → topology integration
│   │   ├── WorkerTopologyBridge.ts  # Worker → topology integration
│   │   ├── TopologyReference.ts     # Reference types
│   │   ├── CodeGeneration.ts        # Topology-aware code gen
│   │   └── index.ts                 # Barrel
│   │
│   ├── solver/                      # Geometric constraint solver
│   │   ├── types.ts                 # Entity types (Point, Line, Circle, Arc)
│   │   ├── ConstraintSolver.ts      # Solver implementation
│   │   └── index.ts                 # Barrel
│   │
│   ├── snapping/                    # Point snapping engine
│   │   ├── types.ts                 # SnapPoint, SnapType
│   │   ├── SnappingEngine.ts        # Nearest-point detection
│   │   ├── Quadtree.ts              # Spatial index
│   │   └── index.ts                 # Barrel
│   │
│   ├── selection/                   # Selection management
│   │   ├── SelectionManager.ts      # Sub-element selection (face/edge/vertex)
│   │   └── circlePointTexture.ts    # Selection visualization
│   │
│   ├── assembly/                    # Assembly solver (mates)
│   │   ├── types.ts                 # Component, Mate, MateType
│   │   ├── AssemblySolver.ts        # Position solver
│   │   └── index.ts                 # Barrel
│   │
│   ├── extensions/                  # Extension loading & registry
│   │   ├── Extension.ts             # Extension interface + manifest
│   │   ├── ExtensionRegistry.ts     # Extension metadata registry
│   │   ├── runtime.ts               # Dynamic loading + registration
│   │   ├── loader.ts                # Boot-time built-in loading
│   │   ├── events.ts                # DOM events for extension store
│   │   └── index.ts                 # Barrel
│   │
│   ├── storage/                     # Persistence layer
│   │   ├── types.ts                 # Storage interfaces
│   │   ├── StorageManager.ts        # Orchestrator
│   │   ├── quick/                   # IDB + LocalGit (fast local)
│   │   ├── remote/                  # GitHub remote store
│   │   ├── supabase/                # Supabase meta service
│   │   └── sync/                    # Sync engine
│   │
│   ├── workers/                     # Worker pool management
│   │   └── WorkerPool.ts            # Pool + job scheduling
│   │
│   ├── data/                        # Static data
│   │   └── examples.ts              # Example projects
│   │
│   ├── platform/                    # OS detection, Tauri bridge
│   ├── auth/                        # Authentication services
│   ├── vcs/                         # Version control types
│   └── utils/
│       └── Logger.ts                # Structured logging
│
├── workers/
│   └── replicad-worker.ts           # WASM worker (runs Replicad)
│
├── components/                      # React components
│   ├── cad/                         # CAD-specific UI
│   │   ├── Viewport.tsx             # 3D viewport (Three.js)
│   │   ├── SketchCanvas.tsx         # 2D sketch overlay
│   │   ├── OperationProperties.tsx  # Dynamic property panel (registry-driven)
│   │   ├── RibbonToolbar.tsx        # Main toolbar
│   │   ├── BrowserPanel.tsx         # Object tree
│   │   ├── Timeline.tsx             # Feature timeline
│   │   ├── CodeEditorPanel.tsx      # Monaco editor
│   │   ├── CADLayout.tsx            # Layout orchestrator
│   │   └── ...                      # Other specialized panels
│   ├── extensions/                  # Extension store UI
│   ├── ui/                          # shadcn/ui primitives
│   ├── layout/                      # App shell, navigation
│   ├── auth/                        # Login, profile
│   ├── project/                     # Project management
│   ├── desktop/                     # Tauri-specific UI
│   └── updater/                     # Auto-update UI
│
├── extensions/                      # User/community extension sources
│   ├── EXTENSION_GUIDE.md
│   └── _template/                   # Starter template
│
├── hooks/                           # Custom React hooks
│   ├── useCADStore.ts               # Store access hook
│   ├── useBackgroundSync.ts         # Auto-save hook
│   ├── useReferenceStatus.ts        # Topology reference status
│   └── useUnsavedChangesWarning.ts  # Navigation guard
│
├── pages/                           # Route pages
│   ├── Index.tsx
│   └── NotFound.tsx
│
└── test/                            # Test files
```

---

## 4. Data Model — Single Source of Truth

### 4.1 The Sketch Primitive (Drawing State)

`SketchPrimitive` is the **runtime representation** of a drawing element during sketch editing. It lives in the Zustand store's `sketchSlice`.

```typescript
// src/store/types.ts — CANONICAL DEFINITION
interface SketchPrimitive {
    id: string;
    type: SketchEntityType;           // ← import from lib/sketch/types 
    points: [number, number][];
    properties?: SketchEntityProperties; // ← import from lib/sketch/types
}
```

**Rules:**
- `type` must use `SketchEntityType` from `lib/sketch/types.ts` (no separate union).
- `properties` must use `SketchEntityProperties` from `lib/sketch/types.ts` (no inline interface).
- Tools create `SketchPrimitive` instances via `processPoints()` or `createInitialPrimitive()`.
- When a sketch is finished, primitives are persisted as a `SketchObject`.

### 4.2 The Sketch Object (Persisted State)

`SketchObject` is the **persisted representation** of a completed sketch. It is stored on `CADObject.dimensions.sketchData`.

```typescript
// src/lib/sketch/types.ts — CANONICAL DEFINITION
interface SketchObject {
    id: string;
    name: string;
    plane: SketchPlane;
    origin: Point2D;
    entities: SketchEntity[];        // Persisted entities (converted from primitives)
    constraints: SketchConstraint[];
    isClosed: boolean;
}
```

**Conversion:** `SketchPrimitive → SketchEntity` is a 1:1 mapping (same fields, plus `construction: boolean`). The conversion function lives in `sketchSlice` and is called during `finishSketch()`.

### 4.3 The CAD Object

```typescript
// src/store/types.ts — CANONICAL DEFINITION  
interface CADObject {
    id: string;
    name: string;
    type: string;                    // Tool ID that created this object
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    dimensions: Record<string, any>; // Tool-specific params (including sketchData)
    color: string;
    visible: boolean;
    selected: boolean;
    geometry?: THREE.BufferGeometry;
    edgeGeometry?: THREE.BufferGeometry;
    vertexGeometry?: THREE.BufferGeometry;
    faceMapping?: FaceMapping[];
    edgeMapping?: EdgeMapping[];
    extensionData?: Record<string, Record<string, any>>;
}
```

### 4.4 The Tool Type

`ToolType` in `store/types.ts` is used by `activeTool` to identify the current tool. It must be a plain `string` (any registered tool ID is valid). The old hardcoded union is removed in favor of runtime validation via the registry.

```typescript
// src/store/types.ts
export type ToolType = string;
```

Validation: `toolRegistry.has(activeTool)` before dispatch.

---

## 5. Tool System

### 5.1 The Tool Interface

Every tool — built-in or extension — implements the same `Tool` interface.

```typescript
// src/lib/tools/types.ts — CANONICAL DEFINITION
interface Tool {
    metadata: ToolMetadata;         // id, label, icon, category, group, shortcut
    uiProperties: ToolUIProperty[]; // Properties panel definition

    // === Category-specific methods (implement only what applies) ===
    
    // PRIMITIVES: Create geometry from parameters
    create?(codeManager, params): string;
    
    // SKETCH (segments): Add to an open sketch profile
    addToSketch?(codeManager, sketchName, primitive): void;
    
    // SKETCH (shapes): Create standalone closed shape
    createShape?(codeManager, primitive, plane): string;
    
    // SKETCH (interactive): Convert raw points to primitive data
    processPoints?(points, properties?): SketchPrimitiveData;
    
    // SKETCH (interactive): Create starting state for drawing
    createInitialPrimitive?(startPoint, properties?): SketchPrimitive;
    
    // SKETCH (graph): Get planar geometry for profile detection
    getPlanarGeometry?(primitive): Geometry[];
    
    // OPERATIONS: Execute on selected objects
    execute?(codeManager, selectedIds, params): void;
    
    // RENDERING: Preview during sketch drawing
    renderPreview?(primitive, to3D, isGhost?): ReactNode;
    
    // RENDERING: Dimension annotations during drawing
    renderAnnotation?(primitive, plane, lockedValues?, dimMode?): ReactNode;
    
    // RENDERING: 3D operation preview (e.g., extrusion ghost)
    render3DPreview?(params, context): ReactNode;
    
    // LIFECYCLE: React to property changes
    onPropertyChange?(params, key, value, objects): Record<string, any> | void;
}
```

### 5.2 Tool Categories

| Category | Primary Method | When Used |
|----------|---------------|-----------|
| `primitive` | `create()` | Creating geometry from parameters (box, cylinder, sphere) |
| `sketch` | `addToSketch()` or `createShape()` | Drawing 2D elements |
| `operation` | `execute()` | Acting on existing geometry (extrude, revolve, fillet) |
| `boolean` | `execute()` | Combining solids (join, cut, intersect) |
| `modify` | `execute()` | Transforming objects (move, rotate, scale) |
| `construct` | `create()` | Creating reference geometry (plane, axis, point) |
| `navigation` | (none — handled by UI) | Viewport interaction modes |

### 5.3 Tool File Structure (One-File-One-Tool)

Every tool must live in its own directory:

```
src/lib/tools/core/{category}/{tool-id}/
├── index.ts            # Tool definition (metadata + uiProperties + logic methods)
├── preview.tsx          # renderPreview, renderAnnotation, render3DPreview (if any)
└── helpers.ts           # Shared math/geometry helpers (optional)
```

**Rules:**
- `index.ts` contains the `Tool` object with all non-rendering methods.
- `preview.tsx` contains React/Three.js rendering methods. It is imported by `index.ts` and assigned to the tool's render methods.
- One export per file: `index.ts` exports the tool, `preview.tsx` exports render functions.
- **No file may define more than one tool.**

**Example: `src/lib/tools/core/sketch/line/`**

```typescript
// index.ts
import { renderLinePreview, renderLineAnnotation } from './preview';

export const lineTool: Tool = {
    metadata: { id: 'line', label: 'Line', icon: 'Minus', category: 'sketch', group: 'Line' },
    uiProperties: [],
    addToSketch(cm, name, prim) { /* ... */ },
    processPoints(points) { /* ... */ },
    createInitialPrimitive(start) { /* ... */ },
    getPlanarGeometry(prim) { /* ... */ },
    renderPreview: renderLinePreview,
    renderAnnotation: renderLineAnnotation,
};
```

```tsx
// preview.tsx
export function renderLinePreview(primitive, to3D, isGhost) { /* Three.js JSX */ }
export function renderLineAnnotation(primitive, plane, locked, dimMode) { /* Three.js JSX */ }
```

### 5.4 Tool Registration

```typescript
// src/lib/tools/index.ts
import { toolRegistry } from './registry';
import { allCoreTools } from './core';

allCoreTools.forEach(tool => toolRegistry.register(tool));

export { toolRegistry };
```

Extension tools register via the same path:

```typescript
// src/lib/extensions/runtime.ts
export function registerExtension(ext: Extension) {
    if (ext.tool) {
        toolRegistry.register(ext.tool);  // Same registry, same API
    }
}
```

### 5.5 Tool Query Patterns (for UI Components)

```typescript
// Get tool definition
const tool = toolRegistry.get(activeTool);          // Returns Tool | undefined

// Get all sketch tools for palette
const sketchTools = toolRegistry.getByCategory('sketch');

// Get default params for property panel
const defaults = toolRegistry.getDefaultParams('extrusion');

// Check if tool has a property dialog
const needsDialog = toolRegistry.requiresDialog('polygon');

// Get tools in a UI group (e.g., all spline variants for dropdown)
const splineGroup = toolRegistry.getByGroup('Spline');
```

---

## 6. Extension System

### 6.1 Architecture

The Extension system is a **thin wrapper** around the Tool system. An Extension bundles a Tool with metadata for the extension store (publishing, versioning, authorship).

```
┌──────────────────────────────────────────────────────┐
│                  EXTENSION                            │
│  ┌───────────────┐  ┌──────────────────────────────┐ │
│  │  Manifest      │  │  Tool (implements Tool i/f) │ │
│  │  (store meta)  │  │  (registered in ToolRegistry │ │
│  └───────────────┘  └──────────────────────────────┘ │
│  onRegister()  │  onUnregister()                     │
└──────────────────────────────────────────────────────┘
```

### 6.2 Boot Sequence

```
App.tsx mounts
  → loadBuiltinExtensions()      // Wraps each core Tool as Extension
      → For each core tool:
          toolToExtension(tool)   // Creates Extension envelope
          extensionRegistry.register(ext)
  → toolRegistry already has core tools (registered in lib/tools/index.ts)
  → loadLocalExtensions()        // Discovers src/extensions/*/
      → registerExtension(ext)   // Registers in BOTH registries
```

### 6.3 Eliminating Dual Registry

**Current problem:** `ToolRegistry` and `ExtensionRegistry` hold overlapping data. UI components only use `ToolRegistry`. `ExtensionRegistry` is only used internally by the extension store UI.

**Target state:** `ExtensionRegistry` manages **extension metadata only** (manifest, publish status, author). It does **not** duplicate tool methods or metadata. It holds a reference to the tool ID, not the tool itself.

```typescript
// Target ExtensionRegistry API
extensionRegistry.getManifest(extensionId): ExtensionManifest;
extensionRegistry.getAll(): ExtensionManifest[];
extensionRegistry.getByCategory(cat): ExtensionManifest[];
extensionRegistry.getPublished(): ExtensionManifest[];
extensionRegistry.getByAuthor(email): ExtensionManifest[];
```

Tool behavior is always queried from `toolRegistry`.

---

## 7. Sketch Pipeline

### 7.1 Data Flow

```
User draws on canvas
  → SketchCanvas calls tool.createInitialPrimitive(startPoint)
  → Mouse move: tool.processPoints(currentPoints) → SketchPrimitive
  → Mouse move: tool.renderPreview(primitive, to3D) → Three.js nodes
  → Mouse up: primitive added to sketchSlice.primitives[]
  → (repeat for each stroke)

User clicks "Finish Sketch"
  → sketchSlice.finishSketch()
      → Convert SketchPrimitive[] → SketchEntity[] (1:1 mapping)
      → Create SketchObject
      → generateSketchCode(sketchObject) → Replicad code string
      → CodeManager.setCode(code)
      → objectSlice.runCode() → Worker → OCCT → geometry
```

### 7.2 Code Generation

```
SketchObject.entities[]
  → For each entity:
      tool = toolRegistry.get(entity.type)
      geom = tool.getPlanarGeometry(entity)   // Get abstract geometry
  → PlanarGraph.addGeometry(geom)             // Build planar graph
  → PlanarGraph.findCycles()                  // Detect closed profiles
  → For each cycle:
      Generate Replicad sketch code (lineTo, arcTo, bezierTo, etc.)
  → For standalone shapes (circle, rectangle, polygon):
      tool.createShape(codeManager, entity, plane)
  → For open wires (unclosed paths):
      Generate wire code
```

### 7.3 Removing `sketch-processor.ts`

`src/lib/sketch-processor.ts` is the **legacy** code generator that works on `SketchPrimitive` directly. It has been superseded by `src/lib/sketch/code-generator.ts` which works on `SketchEntity`. The legacy file must be deleted and all imports removed.

---

## 8. Code Execution Pipeline

### 8.1 Flow

```
User code (string)
  → CodeManager.parse()                // Babel AST
  → CodeManager.mapFeatures()          // Extract FeatureNodes
  → CodeManager.transformForExecution() // Add required imports
  → DependencyGraph.buildFromCode()    // Build DAG
  → DependencyGraph.getExecutionOrder() // Topological sort
  → For each changed node:
      WorkerPool.execute(featureCode)  // Run in Replicad worker
  → Merge results with cached shapes
  → Create Three.js geometries
  → Update CADObject[] in store
```

### 8.2 CodeManager Responsibilities (Current vs Target)

| Responsibility | Current Location | Target Location |
|---|---|---|
| Babel parsing | `CodeManager` | `CodeManager` (keep) |
| Feature mapping | `CodeManager` | `CodeManager` (keep) |
| AST→code generation | `CodeManager` | `CodeManager` (keep) |
| Add/remove features | `CodeManager` | `CodeManager` (keep) |
| Face extrusion logic | `CodeManager.addFaceExtrusion()` | Extract to `extrusion/helpers.ts` |
| DAG building | `objectSlice.runCode()` | `lib/execution/ExecutionEngine.ts` (extract) |
| Worker dispatch | `objectSlice.runCode()` | `lib/execution/ExecutionEngine.ts` (extract) |
| Geometry creation | `objectSlice.runCode()` | `lib/execution/GeometryFactory.ts` (extract) |

---

## 9. Storage & Sync Architecture

### 9.1 Overview

HiveCAD persists project data across three storage layers and synchronises them via a background `SyncEngine`. The design must satisfy two requirements simultaneously:

1. **Auto-create**: new or modified projects push to GitHub/Supabase automatically.
2. **Permanent delete**: deleted projects must not reappear after a sync cycle.

A **tombstone** system resolves this conflict — deletions leave a short-lived marker that tells the sync engine "do not re-pull this project."

### 9.2 Storage Layers

```
┌──────────────────────────────────────────────────────────────┐
│  IndexedDB  (IdbQuickStore)           ← Web primary store    │
│  or Local Git  (LocalGitQuickStore)   ← Tauri primary store  │
│  ─ implements QuickStore interface                           │
├──────────────────────────────────────────────────────────────┤
│  GitHub Repository  (GitHubRemoteStore)                      │
│  ─ implements RemoteStore interface                          │
│  ─ stores projects/ extensions/ hivecad/ directories         │
├──────────────────────────────────────────────────────────────┤
│  Supabase  (SupabaseMetaService)                             │
│  ─ metadata only (project meta, tags, folders, extensions)   │
│  ─ requires authenticated userId                             │
└──────────────────────────────────────────────────────────────┘
```

| Layer | Interface | Purpose | Requires Auth? |
|---|---|---|---|
| `QuickStore` | `IdbQuickStore` / `LocalGitQuickStore` | Fast local read/write of full project data | No |
| `RemoteStore` | `GitHubRemoteStore` | Cloud backup & cross-device sync via GitHub repo | GitHub PAT |
| `MetaService` | `SupabaseMetaService` | Metadata for discovery, social features, community | Supabase userId |

### 9.3 QuickStore Interface

```typescript
interface QuickStore {
  listProjects(): Promise<ProjectMeta[]>;
  loadProject(id: string): Promise<ProjectData | null>;
  saveProject(data: ProjectData): Promise<void>;  // clears tombstone for this id
  deleteProject(id: string): Promise<void>;        // writes tombstone before deleting
  clearAll(): Promise<void>;                       // nuclear wipe, no tombstones
}
```

### 9.4 Tombstone System

When a project is deleted via `QuickStore.deleteProject(id)`:

1. A tombstone key `hive:tombstone:{id}` is written to IndexedDB with a timestamp.
2. The project data is then deleted from the store.
3. The tombstone prevents `SyncEngine` from re-pulling this project from GitHub/Supabase.
4. Tombstones expire after **30 days** (`TOMBSTONE_TTL_MS`).
5. When `saveProject(data)` is called, any existing tombstone for that ID is **cleared** — this allows intentional re-creation.

```
Delete flow:
  deleteProject(id)
    → write tombstone(id, Date.now())
    → delete project data
    → SyncEngine sees tombstone → skips pull for that id
    → SyncEngine.propagateDeletion() → deletes from GitHub + Supabase

Save flow:
  saveProject(data)
    → clear tombstone(data.meta.id)   // allow this project to sync again
    → write project data
```

**Key files:**
- `src/lib/storage/quick/IdbQuickStore.ts` — tombstone read/write
- `src/lib/storage/types.ts` — `QuickStore` interface

### 9.5 SyncEngine — Three-Phase Sync

The `SyncEngine` runs every **30 seconds** on web (disabled on Tauri desktop). Each cycle executes three phases:

```
Phase 1: Propagate Deletions
  ─ Read all tombstoned IDs from QuickStore
  ─ For each: delete from GitHub (RemoteStore) + Supabase (MetaService)
  ─ Errors logged but do not abort sync

Phase 2: Push Local → Remote
  ─ List all local projects from QuickStore
  ─ Push each to GitHub via RemoteStore.saveProject()
  ─ Push metadata to Supabase via MetaService.upsertProjectMeta()
  ─ Does NOT require Supabase userId (GitHub push works standalone)

Phase 3: Pull Remote → Local
  ─ List all projects on GitHub via RemoteStore.listProjects()
  ─ For each remote project:
      ─ If tombstoned locally → SKIP (do not re-create)
      ─ If not in local store → pull and save locally
      ─ If remote is newer → pull and overwrite local
```

**Important**: GitHub sync (phases 1-2 push, phase 3 pull) works **without** a Supabase `userId`. This ensures project data syncs to GitHub even before the user has a Supabase account.

**Key file:** `src/lib/storage/sync/SyncEngine.ts`

### 9.6 Sync Triggers

| Trigger | Mechanism | When |
|---|---|---|
| Auto-sync | 30s interval timer | Always running on web |
| `markDirty()` | Sets dirty flag, next cycle pushes | After any local save (create, rename, tag, folder move) |
| `syncNow()` | Immediate full sync | User clicks "Sync to Cloud" |
| `suspend()` / `resume()` | Pauses/resumes the timer | During `resetAll()`, bulk operations |

### 9.7 UI Operation → Storage Flow

Every UI operation that modifies project data **must** follow this pattern:

```typescript
// 1. Modify data locally
await mgr.quickStore.saveProject(data);
// 2. Mark sync dirty so changes push on next cycle
mgr.syncEngine?.markDirty();
```

For **deletions**, the pattern is:

```typescript
// 1. Delete locally (writes tombstone automatically)
await mgr.quickStore.deleteProject(id);
// 2. Delete from remote stores (with error handling per store)
try { await mgr.remoteStore?.deleteProject(id); } catch (e) { /* logged, retried on next sync */ }
try { await mgr.supabaseMeta?.deleteProjectMeta(id); } catch (e) { /* logged */ }
```

| Operation | Handler | Storage Calls |
|---|---|---|
| Create project | `ProjectDashboard.handleCreateProject` | `quickStore.save` → `markDirty` |
| Delete project | `ProjectDashboard.handleConfirmDelete` | `quickStore.delete` → `remote.delete` → `supabase.delete` |
| Rename project | `ProjectDashboard.handleRenameProject` | `quickStore.save` → `markDirty` |
| Fork project | `ProjectDashboard.handleForkProject` | `quickStore.save` → `markDirty` |
| Update tags | `ProjectDashboard.handleUpdateTags` | `quickStore.save` → `markDirty` |
| Move to folder | `ProjectDashboard.handleMoveProjectToFolder` | `quickStore.save` → `markDirty` |
| Rename folder | `ProjectDashboard.handleRenameFolder` | `quickStore.save` (each project) → `markDirty` |
| Delete folder | `ProjectDashboard.handleDeleteFolder` | `quickStore.save` (each project) → `markDirty` |
| Save from editor | `versioningSlice.saveToLocal` | `quickStore.save` → `markDirty` |
| Sync to cloud | `versioningSlice.syncToCloud` | `syncEngine.syncNow()` |
| Delete tab (empty) | `TabManager.handleConfirmDelete` | `quickStore.delete` → `remote.delete` → `supabase.delete` |
| Reset all | `ProjectDashboard.handleResetRepository` | `mgr.resetAll()` (clears everything, suspends sync) |

### 9.8 `StorageManager` — Singleton Entry Point

`StorageManager` is the single entry point for all storage operations. It holds references to all three stores and the sync engine.

```typescript
class StorageManager {
  quickStore: QuickStore;          // always available
  remoteStore?: RemoteStore;       // set when GitHub PAT connected
  supabaseMeta?: MetaService;      // set when Supabase authenticated
  syncEngine?: SyncEngine;         // created on web, null on Tauri

  // Nuclear reset — clears ALL data everywhere
  async resetAll(onProgress?): Promise<void>;
}
```

`resetAll()` behaviour:
1. Suspends sync engine
2. Calls `quickStore.clearAll()` (no tombstones — full wipe)
3. Clears `localStorage` keys matching `hivecad` or `hive:`
4. Calls `remoteStore.resetRepository()` (deletes all GitHub data)
5. Calls `supabaseMeta.resetAllUserData(userId)` (deletes all Supabase data)
6. **Does NOT resume sync** — user must reconnect GitHub to restart syncing

### 9.9 Debug Tools

Console utilities are available via `window.__hiveDebug` (auto-loaded in `main.tsx`):

| Function | Purpose |
|---|---|
| `inspectAllStorage()` | Dump all projects from IDB, GitHub, Supabase + tombstones |
| `clearAllHiveCADData()` | Nuclear clear of all storage layers |
| `clearLocalCachesOnly()` | Clear only IDB + localStorage (keeps remote data) |
| `forceSyncNow()` | Trigger an immediate sync cycle |

See `docs/STORAGE_DEBUG_GUIDE.md` for usage details.

---

## 10. Store Architecture

### 10.1 Slice Responsibilities

| Slice | Responsibility | May Call |
|---|---|---|
| `objectSlice` | Object CRUD, active tool, code state, operation orchestration | `CodeManager`, `ToolRegistry`, `WorkerPool`, `DependencyGraph` |
| `sketchSlice` | Sketch mode, primitives, finish/cancel sketch | `sketch/code-generator`, `ToolRegistry` |
| `viewSlice` | Camera, grid, visibility, projection | (none) |
| `versioningSlice` | History, undo/redo, file management, VCS | `StorageManager` |
| `solverSlice` | Constraint solver entity/constraint management | `ConstraintSolver` |
| `snappingSlice` | Snap state | `SnappingEngine` |
| `toolbarSlice` | Custom toolbar layout | `useUIStore` |

### 10.2 What Must **Not** Be in Slices

- **File I/O logic** (belongs in `lib/storage/`)
- **Code parsing/generation** (belongs in `CodeManager`)
- **Geometry algorithms** (belongs in `lib/` modules)
- **Three.js geometry construction** (belongs in rendering layer)
- **Tool dispatch logic** (belongs in `ToolRegistry`)

---

## 11. Component Architecture

### 11.1 Component Rules

1. **No tool-specific branching.** Use `toolRegistry.get(id)` and call the tool's methods.
2. **No direct store manipulation for business logic.** Call store actions that delegate to `lib/` services.
3. **No inline Three.js geometry construction** outside of tool `renderPreview`/`render3DPreview` methods.

### 11.2 Key Components

| Component | Purpose | Info Source |
|---|---|---|
| `OperationProperties` | Dynamic property panel for active tool/operation | `toolRegistry.get(id).uiProperties` |
| `RibbonToolbar` | Tool buttons organized by category | `toolRegistry.getByCategory()` |
| `SketchPalette` | Sketch tool selector (shown during sketch mode) | `toolRegistry.getByCategory('sketch')` |
| `SketchCanvas` | 2D drawing surface — dispatches to tool methods | `toolRegistry.get(activeTool)` |
| `Viewport` | 3D scene with selection | `objectSlice.objects` |
| `SceneComponents` | Renders 3D previews for active operations | `toolRegistry.get(type).render3DPreview()` |

---

## 13. Agent-Optimized Architecture & Headless Testing

### 13.1 Objective

HiveCAD must be structured so AI agents can implement and verify business logic without DOM, Canvas, or React mounting.

**Key Metric:** 100% of business logic is testable in Node.js (Vitest) using `.test.ts` tests.

### 13.2 Hollow Component Pattern

To reduce UI-coupled test flakiness, feature logic is split into pure modules and thin view binders.

**Feature file contract (required):**

```
src/lib/tools/core/{category}/{tool-id}/
├── logic.ts      # Pure logic: math, validation, code generation
├── state.ts      # Pure state model or reducer for feature params/state
└── index.tsx     # View binder: passes logic outputs to React/Three UI
```

**Implementation status:**
- `operation/extrusion` now uses this split (`logic.ts`, `state.ts`, `index.tsx`) with pure execution logic extracted from tool wiring.
- Core tools are required to use this split with no legacy method signatures.

### 13.3 Code-Snapshot Testing Strategy

Geometry output is validated through deterministic intermediate representation (Replicad code strings), not pixel/mesh assertions.

Pipeline:
1. Input tool parameters
2. Execute pure `logic.ts` generator
3. Assert generated code string contains expected IR

**Canonical example implemented:**
- `primitive/box/logic.ts` exports `generateBoxCodeSnapshot(params)`.
- `primitive/box/logic.test.ts` validates expected Replicad code string.

### 13.4 Deterministic IDs for Testability

All ID generation now routes through `src/lib/utils/id-generator.ts`:

```typescript
ID.generate();
ID.generatePrefixed('sk');
ID.reset('mock-id');
```

Rules:
- Never call `crypto.randomUUID()` directly in `lib/`.
- In test mode (`NODE_ENV=test`) IDs are deterministic and incrementing.
- In non-test mode, runtime uses `crypto.randomUUID()` with safe fallback.

### 13.5 Fixture-First Workflow

State fixtures live in:

```
src/test/fixtures/
├── simple-box.json
├── complex-sketch.json
└── broken-fillet.json
```

Store hydration support:
- `createCADStore(initialState?)` accepts fixture JSON at store construction.
- `versioningSlice.loadState(fixture)` hydrates an existing store.
- `store/hydration.ts` normalizes fixture JSON into store-safe types (`Set`, `Map`, sketches).

### 13.6 Strict Interface Boundaries with Context Objects

Tool invocation is context-first:

```typescript
interface ToolContext {
  params: Record<string, any>;
  scene: { selectedIds: string[]; objects: CADObject[] };
  codeManager: CodeManager;
}
```

Current enforcement model:
- Runtime dispatch in `lib/tools/invoke.ts` sends `ToolContext` first.
- Only context-style handlers are supported. Positional signatures are invalid.

### 13.7 Headless Test Runner Contract

Vitest is configured for headless business-logic runs:

- Environment: `node`
- Include: `src/lib/**/*.test.ts`
- Exclude: `.tsx` and `src/test/**`

This establishes the agent contract: if `lib` tests pass, business logic is valid.

### 13.8 Migration Guardrails

1. Keep React/Three rendering in view binders only (`index.tsx`/`preview.tsx`).
2. Keep computation, validation, and code generation in `logic.ts`.
3. Add snapshot-style tests for each new tool logic module.
4. Use fixture hydration for regression reproduction before touching UI.

### 13.9 Automated Enforcement Guard

The architecture is enforced with a headless guard suite:

- File: `src/lib/testing/architecture-guard.test.ts`
- Executed by: `npm test` (Vitest lib-only run)

Guard assertions:
1. No core tool may declare positional signatures such as:
  - `create(codeManager, ...)`
  - `execute(codeManager, ...)`
  - `addToSketch(codeManager, ...)`
  - `createShape(codeManager, ...)`
2. `src/lib/tools/invoke.ts` must not contain arity-based fallback dispatch.
3. `src/lib/**` must not call `crypto.randomUUID()` directly (except `src/lib/utils/id-generator.ts`).

If any guard fails, CI/local test runs fail immediately.

---

## Appendix A: Adding a New Tool (Checklist)

1. **Create directory:** `src/lib/tools/core/{category}/{tool-id}/`
2. **Create `logic.ts`:** Implement pure math/validation/code-generation logic.
3. **Create `state.ts`:** Implement pure local reducer/state defaults for tool params.
4. **Create `index.tsx`:** Implement a hollow view binder (no business logic).
5. **Create `index.ts`:** Define the `Tool` object and bind methods to `ToolContext` signatures only.
6. **Create `preview.tsx`** (if needed): Keep visual rendering isolated.
7. **Export from category index:** Add to `src/lib/tools/core/{category}/index.ts`.
8. **Register in `allCoreTools`:** Add to the array in `src/lib/tools/core/index.ts`.
9. **Add tests:**
  - `logic.test.ts` snapshot-style code assertions
  - Ensure `architecture-guard.test.ts` remains green
10. **Done.** No component-level tool branching changes are required.

## Appendix B: Adding a New Extension Tool (Checklist)

1. Follow the same `Tool` interface as a core tool.
2. Wrap in an `Extension` object with a manifest.
3. Call `registerExtension(extension)`.
4. **Done.** The tool appears in the registry and UI identically to core tools.

## Appendix C: Sketch Entity Type Registry

All `SketchEntityType` values must correspond to a registered tool with at least `processPoints()` and `createInitialPrimitive()`. The code generator uses `toolRegistry.get(entity.type)` to dispatch code generation.

| Entity Type | Tool ID | Code Gen Method | Shape Type |
|---|---|---|---|
| `line` | `line` | `addToSketch` | Segment |
| `threePointsArc` | `threePointsArc` | `addToSketch` | Segment |
| `centerPointArc` | `centerPointArc` | `addToSketch` | Segment |
| `smoothSpline` | `smoothSpline` | `addToSketch` | Segment |
| `bezier` | `bezier` | `addToSketch` | Segment |
| `quadraticBezier` | `quadraticBezier` | `addToSketch` | Segment |
| `cubicBezier` | `cubicBezier` | `addToSketch` | Segment |
| `rectangle` | `rectangle` | `createShape` | Closed Shape |
| `roundedRectangle` | `roundedRectangle` | `createShape` | Closed Shape |
| `circle` | `circle` | `createShape` | Closed Shape |
| `ellipse` | `ellipse` | `createShape` | Closed Shape |
| `polygon` | `polygon` | `createShape` | Closed Shape |
| `text` | `text` | `createShape` | Closed Shape |
| `constructionLine` | `constructionLine` | (none — guide only) | Construction |
| `constructionCircle` | `constructionCircle` | (none — guide only) | Construction |

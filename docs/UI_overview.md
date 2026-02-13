# HiveCAD UI Overview

> **Purpose**: This document serves as a navigation guide for agents working on the HiveCAD user interface. It maps out the UI component structure, organization, and key interaction points.

---

## Table of Contents
1. [Application Structure](#application-structure)
2. [Main Layout Components](#main-layout-components)
3. [UI Component Library](#ui-component-library)
4. [Dialogs and Modals](#dialogs-and-modals)
5. [Panels and Sidebars](#panels-and-sidebars)
6. [Toolbar and Menu System](#toolbar-and-menu-system)
7. [Notifications System](#notifications-system)
8. [3D Viewport](#3d-viewport)
9. [State Management](#state-management)
10. [Key UI Flows](#key-ui-flows)

---

## Application Structure

### Entry Point
- **File**: [src/App.tsx](../src/App.tsx)
- **Responsibilities**: 
  - Root application setup
  - Theme management (light/dark mode)
  - Router configuration
  - Global providers (QueryClient, TooltipProvider)
  - Toast notifications (Sonner)
  - Update checker integration

### Routing
- **Route Structure**:
  - `/` → `AuthGateway` → `TabManager` (Main application)
  - `*` → `NotFound` page

### Pages
Located in `src/pages/`:
- `Index.tsx` - Simply wraps CADLayout (legacy, might be unused)
- `NotFound.tsx` - 404 error page

---

## Main Layout Components

### TabManager
**File**: [src/components/layout/TabManager.tsx](../src/components/layout/TabManager.tsx)

**Purpose**: Manages multiple project tabs and the dashboard

**Key Features**:
- Handles multiple tabs (Dashboard and Project tabs)
- Tab creation, deletion, and switching
- Unsaved changes warnings
- Background sync coordination
- Command palette integration

**Tab Types**:
- `dashboard` - Project selection/management view
- `project` - Active CAD editor view

### CADLayout
**File**: [src/components/cad/CADLayout.tsx](../src/components/cad/CADLayout.tsx)

**Purpose**: Main CAD editor layout orchestrator

**Structure**:
```
┌────────────────────────────────────────┐
│           MenuBar                       │
├────────────────────────────────────────┤
│         RibbonToolbar                   │
├──────────┬─────────────────────┬────────┤
│          │                     │        │
│ Unified  │     Viewport        │ Opera- │
│ Sidebar  │   (3D/Sketch)       │ tion   │
│          │                     │ Props  │
│          │                     │        │
├──────────┴─────────────────────┴────────┤
│           StatusBar                     │
└────────────────────────────────────────┘
```

**Child Components**:
- `MenuBar` - Top menu with file operations
- `RibbonToolbar` - Context-sensitive tool ribbon
- `UnifiedSidebar` - Left sidebar with tabs
- `Viewport` - 3D/2D canvas
- `SketchPalette` - Floating sketch tools (when in sketch mode)
- `OperationProperties` - Right panel for tool parameters
- `StatusBar` - Bottom status and view controls
- `ImportWarningModal` - File import warnings
- `MeshingProgress` - Progress indicator for meshing operations

**Keyboard Shortcuts** (handled here):
- `Ctrl/Cmd + S` - Save project
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Y` - Redo
- `Ctrl/Cmd + D` - Duplicate selected
- `Delete/Backspace` - Delete selected objects
- `Escape` - Exit fullscreen/sketch mode

### ProjectDashboard
**File**: [src/components/project/ProjectDashboard.tsx](../src/components/project/ProjectDashboard.tsx)

**Purpose**: Project library and discovery interface

**Features**:
- Project grid/list view
- Search and filtering
- Tags and folders
- Starred projects
- Project thumbnails
- Workspace/Discover modes
- Settings menu
- User account management

**Sub-components**:
- `ProjectCard` - Individual project card
- `ProjectHistoryView` - Version history modal

---

## UI Component Library

### Base Components
**Location**: `src/components/ui/`

HiveCAD uses **shadcn/ui** components built on **Radix UI** primitives with **Tailwind CSS**.

#### Common Components:
- `button.tsx` - Buttons with variants (default, destructive, outline, ghost, link)
- `dialog.tsx` - Modal dialogs
- `alert-dialog.tsx` - Confirmation dialogs
- `dropdown-menu.tsx` - Dropdown menus
- `context-menu.tsx` - Right-click context menus
- `tooltip.tsx` - Hover tooltips
- `input.tsx` - Text inputs
- `textarea.tsx` - Multi-line text inputs
- `select.tsx` - Dropdown selects
- `checkbox.tsx` - Checkboxes
- `switch.tsx` - Toggle switches
- `slider.tsx` - Range sliders
- `tabs.tsx` - Tab navigation
- `card.tsx` - Card containers
- `badge.tsx` - Status badges
- `separator.tsx` - Horizontal/vertical dividers
- `scroll-area.tsx` - Custom scrollbars
- `popover.tsx` - Floating popovers
- `command.tsx` - Command palette UI
- `table.tsx` - Data tables
- `sheet.tsx` - Slide-out panels
- `sidebar.tsx` - Sidebar layout
- `menubar.tsx` - Menu bar component
- `navigation-menu.tsx` - Navigation component
- `accordion.tsx` - Collapsible sections
- `collapsible.tsx` - Expand/collapse wrapper
- `hover-card.tsx` - Hover preview cards
- `progress.tsx` - Progress bars
- `skeleton.tsx` - Loading skeletons
- `toggle.tsx` / `toggle-group.tsx` - Toggle buttons
- `calendar.tsx` - Date picker
- `form.tsx` - Form helpers
- `label.tsx` - Form labels
- `radio-group.tsx` - Radio buttons
- `alert.tsx` - Alert messages
- `breadcrumb.tsx` - Breadcrumb navigation
- `aspect-ratio.tsx` - Aspect ratio container
- `avatar.tsx` - User avatar
- `carousel.tsx` - Image carousel
- `chart.tsx` - Chart component
- `pagination.tsx` - Page navigation
- `resizable.tsx` - Resizable panels
- `input-otp.tsx` - OTP input

#### Custom UI Components:
- `CloudConnectionsDialog.tsx` - GitHub PAT connection setup
- `SettingsDialog.tsx` - Application settings
- `CommandPalette.tsx` - Quick command/search interface
- `DeveloperFeedbackDialog.tsx` - Developer feedback submission
- `IconPicker.tsx` / `IconResolver.tsx` - Icon selection system
- `LoadingScreen.tsx` - Full-page loading state
- `UnifiedColorPicker.tsx` - Color selection tool
- `sonner.tsx` - Toast notification wrapper

---

## Dialogs and Modals

### Authentication
**Location**: `src/components/auth/`

#### AuthDialog
**File**: `AuthDialog.tsx`
- Email/password login and signup
- GitHub PAT setup flow
- Multi-step wizard (welcome → auth → PAT)

#### AuthGateway
**File**: `AuthGateway.tsx`
- Checks authentication status
- Initializes StorageManager
- Auto-connects remote storage with PAT

### Application Dialogs

#### SettingsDialog
**File**: `src/components/ui/SettingsDialog.tsx`

**Tabs**:
- **General**: Theme, keyboard shortcuts, snapping
- **Account**: User info, PAT management, logout
- **Storage**: Reset storage, view statistics
- **Updates**: Check/install updates (desktop only)

#### CloudConnectionsDialog
**File**: `src/components/ui/CloudConnectionsDialog.tsx`
- GitHub PAT input and verification
- Instructions for generating PAT

#### CommandPalette
**File**: `src/components/ui/CommandPalette.tsx`

**Triggered by**: `Ctrl/Cmd + K`

**Features**:
- Quick tool selection
- Recent actions
- Extension search
- Command execution

#### DeveloperFeedbackDialog
**File**: `src/components/ui/DeveloperFeedbackDialog.tsx`
- Feedback submission form
- Bug reports and feature requests

### CAD-Specific Dialogs

#### FileManagerDialog
**File**: `src/components/cad/FileManagerDialog.tsx`
- Open projects from cloud storage
- Project browsing interface

#### AddToolDialog
**File**: `src/components/cad/AddToolDialog.tsx`
- Add custom tools to ribbon
- Tool search and selection

#### SketchToolDialog
**File**: `src/components/cad/SketchToolDialog.tsx`
- Sketch tool configuration

#### ReferenceRepairDialog
**File**: `src/components/cad/ReferenceRepairDialog.tsx`
- Fix broken references in imported files

#### ImportWarningModal
**File**: `src/components/cad/ImportWarningModal.tsx`
- Warnings for file imports

### Extension Dialogs

#### ExtensionStoreDialog
**File**: `src/components/extensions/ExtensionStoreDialog.tsx`
- Browse and install extensions
- Extension marketplace

#### CreateExtensionForm
**File**: `src/components/extensions/CreateExtensionForm.tsx`
- Create new extensions
- Extension metadata input

### Update System

#### UpdateChecker
**File**: `src/components/updater/UpdateChecker.tsx`
- Checks for app updates on mount
- Alert dialog for available updates
- Install and relaunch functionality (Tauri only)

---

## Panels and Sidebars

### UnifiedSidebar (Left Panel)
**File**: `src/components/cad/UnifiedSidebar.tsx`

**Tabs**:
1. **Browser** - Object hierarchy tree
2. **Code** - Code editor
3. **Git** - Version control
4. **Comments** - Annotations

**State**: Collapsible, remembers active tab

#### BrowserPanel
**File**: `src/components/cad/BrowserPanel.tsx`

**Purpose**: Object hierarchy and scene browser

**Features**:
- Tree view of CAD objects
- Visibility toggles
- Selection management
- Object renaming
- Delete operations
- Nested groups/folders

#### CodeEditorPanel
**File**: `src/components/cad/CodeEditorPanel.tsx`
- Code editor for parametric modeling
- Syntax highlighting
- Code execution

#### VersioningPanel
**File**: `src/components/cad/VersioningPanel.tsx`

**Features**:
- Commit history
- Branch visualization (VCSGraph)
- Commit/push/pull operations
- Diff viewing

#### CommentsPanel
**File**: `src/components/cad/CommentsPanel.tsx`
- Add comments to project
- Comment threads
- Delete comments

### OperationProperties (Right Panel)
**File**: `src/components/cad/OperationProperties.tsx`

**Purpose**: Tool parameter inputs

**Dynamic Content**: Changes based on active tool/operation
- Input fields for dimensions
- Material properties
- Operation-specific settings

---

## Toolbar and Menu System

### MenuBar (Top Bar)
**File**: `src/components/cad/MenuBar.tsx`

**Sections**:
1. **File Operations**:
   - New/Open/Save
   - Cloud sync status
   - File name editing

2. **Edit Operations**:
   - Undo/Redo (with sketch mode awareness)
   - Copy/Paste

3. **Tab Management**:
   - Tab list with close buttons
   - "+" to create new tabs
   - Active tab highlight

4. **User Section**:
   - User avatar/icon
   - Settings access
   - Search toggle
   - Notifications
   - Help

**Indicators**:
- Save status (saved/saving/error)
- Sync status (synced/syncing/error)
- Unpushed changes badge

### RibbonToolbar (Context Toolbar)
**File**: `src/components/cad/RibbonToolbar.tsx`

**Purpose**: Context-sensitive tool ribbon (like Fusion 360)

**Dynamic Toolbars**:
- Changes based on active workflow (SOLID, SURFACE, MESH, etc.)
- Customizable sections and tools
- Drag-and-drop reorganization
- Folder groups

**Default Toolbars**:
- **SOLID** - CREATE, MODIFY, COMBINE, CONFIGURE, CONSTRUCT, INSPECT
- **SKETCH** - Drawing tools (when in sketch mode)
- **MANAGE** - Project management
- **UTILITIES** - Import/Export

**Features**:
- Tool icons with labels
- Folder dropdowns
- Add/remove tools
- Edit mode for customization
- Extension tools integration

**Related Components**:
- `AddToolDialog` - Add tools to ribbon
- `IconPicker` - Choose tool icons

### StatusBar (Bottom Bar)
**File**: `src/components/cad/StatusBar.tsx`

**Left Section** - Tools:
- Pan/Orbit/Zoom selection
- Section view toggle
- Measurement tools

**Center Section** - Object Info:
- Selected object count
- Object details

**Right Section** - View Controls:
- Projection mode (Perspective/Orthographic)
- Background mode (Gradient/Solid/Environment)
- Grid visibility toggle
- Fullscreen toggle
- Zoom controls (+ with FloatingZoomControls)

**Sync Status Indicator**:
- Cloud icon with status colors
- Sync status text
- Click to open FileManager

### SketchPalette (Floating Toolbar)
**File**: `src/components/cad/SketchPalette.tsx`

**Visibility**: Only appears in sketch mode

**Tools**:
- Line
- Circle
- Rectangle
- Arc
- Spline
- Point
- Dimension
- Constraint tools

**Position**: Floating, draggable

---

## Notifications System

### Toast Notifications
**Library**: Sonner (via `sonner` package)

**Component**: [src/components/ui/sonner.tsx](../src/components/ui/sonner.tsx)

**Mounted in**: `App.tsx`

**Usage Examples**:
```typescript
import { toast } from 'sonner';

// Basic notification
toast("Project saved");

// Success
toast.success("Extension installed!");

// Error
toast.error("Failed to connect to cloud");

// Warning
toast.warning("Unsaved changes");

// Info
toast.info("Keyboard shortcuts updated");

// Loading (with ID for updating)
toast.loading("Syncing...", { id: 'sync' });
toast.success("Sync complete", { id: 'sync' });

// With action
toast("Comment added", {
  action: {
    label: "Undo",
    onClick: () => console.log("Undo")
  }
});
```

**Common Usage Locations**:
- File operations (save, open, delete)
- Cloud sync operations
- Tool actions
- Extension installation
- Authentication events
- Error handling

---

## 3D Viewport

### Viewport
**File**: `src/components/cad/Viewport.tsx`

**Technology**: React Three Fiber (R3F) + Three.js

**Key Features**:
- 3D object rendering
- Selection (face, edge, vertex)
- Hover highlighting
- Camera controls (ArcballControls)
- Grid display
- Sketch mode rendering
- Section views
- Background modes

**Sub-components** (`src/components/cad/viewport/`):
- `SelectionHighlighters.tsx` - Face/edge/vertex highlighting
- `SceneComponents.tsx` - Scene utilities (camera, grid, etc.)

**Related Components**:
- `SketchCanvas.tsx` - 2D sketch editing overlay
- `SketchAnnotations.tsx` - Dimension/constraint display
- `ViewCube.tsx` - View orientation cube

### ViewCube
**File**: `src/components/cad/ViewCube.tsx`

**Purpose**: Quick view orientation change

**Views**: Front, Back, Left, Right, Top, Bottom, Home, Isometric

**Position**: Bottom-right of viewport

### FloatingZoomControls
**File**: `src/components/cad/FloatingZoomControls.tsx`

**Position**: Right side of viewport

**Controls**: Zoom in, Zoom out, Zoom to fit

---

## State Management

### Global Stores
**Location**: `src/store/`

#### useGlobalStore
**File**: `useGlobalStore.ts`

**Purpose**: Authentication and global app state

**State**:
- `user` - Current user
- `authLoaded` - Auth initialization complete
- `isAutosaveEnabled` - Auto-save toggle
- `isStorageConnected` - Cloud storage connection status
- `showPATDialog` - PAT dialog visibility

**Actions**:
- `login()`, `signup()`, `logout()`
- `signInWithOAuth()`
- `setPAT()`, `setShowPATDialog()`
- `loadSession()`, `initializeAuth()`

#### useUIStore
**File**: `useUIStore.ts`

**Purpose**: UI preferences and custom ribbons

**State**:
- `theme` - 'dark' or 'light'
- `customToolbars` - User-defined ribbon toolbars
- `activeToolbarId` - Current ribbon
- `isEditingToolbar` - Ribbon edit mode
- `folders` - Toolbar folders
- `isInitialized` - Store loaded

**Actions**:
- `setTheme()`, `toggleTheme()`
- `addCustomToolbar()`, `deleteCustomToolbar()`
- `addSection()`, `deleteSection()`
- `addTool()`, `removeTool()`
- Drag-and-drop helpers
- `initialize()`, `loadFromStorage()`, `saveToStorage()`

#### useCADStore (via Context)
**Files**: 
- `store/createCADStore.ts` - Store factory
- `store/CADStoreContext.tsx` - Context provider
- `hooks/useCADStore.ts` - Hook

**Purpose**: Per-tab CAD state (one store per tab)

**Why Context?**: Each tab has its own CAD state, so stores are created dynamically and provided via React Context.

**State Slices** (see `store/slices/`):
- **ObjectSlice** - CAD objects, selection, tools
- **ViewSlice** - Camera, zoom, grid, projection
- **SketchSlice** - Sketch mode, primitives, constraints
- **HistorySlice** - Undo/redo, timeline
- **FileSlice** - File name, save status, sync
- **CommentsSlice** - Project comments
- **VersioningSlice** - Git/VCS operations
- **AssemblySlice** - Assembly mates and components
- **ExtensionSlice** - Extension management

**Accessing CADStore**:
```typescript
// Inside CADStoreContext provider
import { useCADStore } from '@/hooks/useCADStore';

const objects = useCADStore(state => state.objects);
const addObject = useCADStore(state => state.addObject);

// Get store API
import { useCADStoreApi } from '@/hooks/useCADStore';
const store = useCADStoreApi();
```

---

## Key UI Flows

### 1. Application Startup
```
App.tsx
  ├─ Initialize theme
  ├─ Setup QueryClient
  ├─ Setup TooltipProvider
  ├─ Render Sonner (toasts)
  ├─ Render UpdateChecker
  └─ BrowserRouter
      └─ AuthGateway
          ├─ Initialize auth
          ├─ Initialize StorageManager
          ├─ Auto-connect remote storage (if PAT)
          └─ TabManager (if authenticated)
              └─ Dashboard or CADLayout tabs
```

### 2. Opening a Project
```
ProjectDashboard
  └─ User clicks project card
      └─ TabManager.openProjectInNewTab()
          ├─ If current tab is dashboard → Convert to project
          │   ├─ Load project data
          │   ├─ Populate CADStore
          │   └─ Switch tab type to 'project'
          └─ Else → Create new tab
              ├─ Create new CADStore
              ├─ Load project data
              └─ Switch to new tab

Tab switches to CADLayout
```

### 3. Tool Usage
```
User clicks tool in RibbonToolbar
  └─ setActiveTool(toolId)
      ├─ OperationProperties shows tool parameters
      ├─ StatusBar updates active tool indicator
      └─ Viewport cursor/mode changes

User configures parameters in OperationProperties

User clicks viewport or enters values
  └─ Tool executes
      ├─ addObject() or updateObject()
      ├─ History item created
      ├─ Code generated (if applicable)
      ├─ Toast notification
      └─ Auto-save triggered (if enabled)
```

### 4. Sketch Mode
```
User clicks "Sketch" tool
  └─ setActiveTool('sketch')
      └─ PlaneSelector overlay appears

User selects plane (XY, XZ, YZ, or face)
  └─ enterSketchMode(planeDef)
      ├─ isSketchMode = true
      ├─ Viewport switches to 2D mode
      ├─ SketchPalette appears
      ├─ SketchCanvas overlay appears
      └─ RibbonToolbar shows sketch tools

User draws with sketch tools
  └─ addSketchPrimitive()
      ├─ SketchAnnotations display dimensions
      └─ Primitives added to activeSketchPrimitives[]

User clicks "Finish Sketch"
  └─ finishSketch()
      ├─ Create sketch object
      ├─ exitSketchMode()
      ├─ Return to 3D mode
      └─ SketchPalette/SketchCanvas disappear
```

### 5. Save and Sync
```
Auto-save timer fires (or Ctrl+S pressed)
  └─ syncToCloud() in FileSlice
      ├─ pendingSave = true
      ├─ isSaving = true
      ├─ Serialize current state
      ├─ StorageManager.saveProject()
      │   ├─ QuickStore.saveProject() (local IndexedDB)
      │   └─ SyncEngine.queueOperation() (cloud sync)
      ├─ isSaving = false
      ├─ Update lastSaveTime
      └─ toast.success("Project saved")

SyncEngine (background)
  └─ Processes queue
      ├─ POST /create_project or /update_project
      ├─ Updates sync status
      └─ MenuBar shows sync indicator
```

### 6. Version Control
```
User opens VersioningPanel
  └─ Shows commit history (VCSGraph)

User clicks "Commit"
  └─ commitChanges()
      ├─ Create VCS commit
      ├─ Update history
      ├─ Sync to remote
      └─ Refresh VCSGraph
```

### 7. Extension Installation
```
User opens ExtensionStoreDialog
  └─ Browses extensions

User clicks "Install"
  └─ installExtension()
      ├─ toast.loading("Installing...")
      ├─ StorageManager.installExtension()
      ├─ Tool registry updated
      ├─ RibbonToolbar refreshes
      └─ toast.success("Extension installed!")
```

---

## Component Organization Summary

```
src/
├── App.tsx                           # Root component
├── main.tsx                          # Entry point
├── pages/                            # Page components
│   ├── Index.tsx                     # CADLayout wrapper
│   └── NotFound.tsx                  # 404 page
├── components/
│   ├── ErrorBoundary.tsx             # Error boundary wrapper
│   ├── NavLink.tsx                   # Navigation link component
│   ├── auth/                         # Authentication UI
│   │   ├── AuthDialog.tsx            # Login/signup modal
│   │   └── AuthGateway.tsx           # Auth guard/initializer
│   ├── cad/                          # Main CAD interface
│   │   ├── CADLayout.tsx             # Main editor layout
│   │   ├── MenuBar.tsx               # Top menu bar
│   │   ├── RibbonToolbar.tsx         # Context ribbon
│   │   ├── StatusBar.tsx             # Bottom status bar
│   │   ├── UnifiedSidebar.tsx        # Left tabbed sidebar
│   │   ├── BrowserPanel.tsx          # Object tree
│   │   ├── CodeEditorPanel.tsx       # Code editor
│   │   ├── VersioningPanel.tsx       # Git panel
│   │   ├── CommentsPanel.tsx         # Comments panel
│   │   ├── OperationProperties.tsx   # Right parameter panel
│   │   ├── Viewport.tsx              # 3D canvas
│   │   ├── ViewCube.tsx              # View orientation cube
│   │   ├── SketchCanvas.tsx          # 2D sketch overlay
│   │   ├── SketchPalette.tsx         # Sketch tools
│   │   ├── SketchAnnotations.tsx     # Dimensions display
│   │   ├── Timeline.tsx              # History timeline
│   │   ├── VCSGraph.tsx              # Git graph
│   │   ├── FloatingZoomControls.tsx  # Zoom buttons
│   │   ├── GridToggle.tsx            # Grid button
│   │   ├── ReferenceIndicator.tsx    # Reference status
│   │   ├── MeshingProgress.tsx       # Meshing indicator
│   │   ├── AddToolDialog.tsx         # Add tool modal
│   │   ├── SketchToolDialog.tsx      # Sketch tool config
│   │   ├── FileManagerDialog.tsx     # Open file modal
│   │   ├── ImportWarningModal.tsx    # Import warnings
│   │   ├── ReferenceRepairDialog.tsx # Fix references
│   │   └── viewport/                 # Viewport sub-components
│   ├── desktop/                      # Desktop-specific
│   ├── extensions/                   # Extension UI
│   │   ├── ExtensionStoreDialog.tsx  # Extension marketplace
│   │   ├── ExtensionCard.tsx         # Extension card
│   │   └── CreateExtensionForm.tsx   # New extension form
│   ├── layout/                       # Layout managers
│   │   ├── TabManager.tsx            # Tab system
│   │   ├── TabContext.tsx            # Tab context provider
│   │   ├── BackgroundSyncHandler.tsx # Sync coordinator
│   │   └── UnsavedChangesListener.tsx # Unsaved warning
│   ├── project/                      # Project management
│   │   ├── ProjectDashboard.tsx      # Project library
│   │   ├── ProjectCard.tsx           # Project card
│   │   └── ProjectHistoryView.tsx    # Version history modal
│   ├── ui/                           # UI primitives
│   │   ├── [shadcn components]       # 40+ base components
│   │   ├── CloudConnectionsDialog.tsx # PAT setup
│   │   ├── SettingsDialog.tsx        # Settings modal
│   │   ├── CommandPalette.tsx        # Command search
│   │   ├── DeveloperFeedbackDialog.tsx # Feedback form
│   │   ├── IconPicker.tsx            # Icon selector
│   │   ├── IconResolver.tsx          # Icon renderer
│   │   ├── LoadingScreen.tsx         # Loading overlay
│   │   └── UnifiedColorPicker.tsx    # Color picker
│   └── updater/                      # Update system
│       └── UpdateChecker.tsx         # Update notifications
├── store/                            # State management
│   ├── useGlobalStore.ts             # Global app state
│   ├── useUIStore.ts                 # UI preferences
│   ├── createCADStore.ts             # CAD store factory
│   ├── CADStoreContext.tsx           # CAD context provider
│   ├── types.ts                      # Store types
│   └── slices/                       # CAD store slices
└── hooks/
    ├── useCADStore.ts                # CAD store hook
    ├── useBackgroundSync.ts          # Sync hook
    └── useUnsavedChangesWarning.ts   # Unsaved hook
```

---

## Tips for Working with the UI

### Finding the Right Component

**Want to modify...**
- **Top menu** → `MenuBar.tsx`
- **Tool ribbon** → `RibbonToolbar.tsx`
- **Object tree** → `BrowserPanel.tsx`
- **Code editor** → `CodeEditorPanel.tsx`
- **Git interface** → `VersioningPanel.tsx`
- **3D viewport** → `Viewport.tsx`
- **Status bar** → `StatusBar.tsx`
- **Settings** → `SettingsDialog.tsx`
- **Project library** → `ProjectDashboard.tsx`
- **Notifications** → Search for `toast` usage
- **Dialogs** → Check `components/ui/` or `components/cad/`
- **Authentication** → `components/auth/`

### Adding New Features

**New CAD Tool**:
1. Register tool in `toolRegistry` (`lib/tools/`)
2. Add icon and metadata
3. Tool automatically appears in RibbonToolbar
4. Implement tool logic in store action

**New Dialog**:
1. Create component in `components/ui/` or appropriate folder
2. Use `Dialog` from `components/ui/dialog.tsx`
3. Add trigger (button/menu item)
4. Handle state (open/close) with useState or store

**New Panel**:
1. Create component in `components/cad/`
2. Add tab to `UnifiedSidebar.tsx` if left panel
3. Or create collapsible section if right panel

**New Notification**:
```typescript
import { toast } from 'sonner';
toast.success("Operation complete!");
```

### Styling

- **System**: Tailwind CSS with custom theme
- **Theme variables**: See `index.css` and `components.json`
- **Dark/Light mode**: Controlled by `useUIStore().theme`
- **Custom colors**: Use theme variables (`bg-background`, `text-foreground`, etc.)
- **Icons**: Lucide React (imported from `lucide-react`)

### Common Patterns

**Accessing CAD state**:
```typescript
const { objects, selectedIds, addObject } = useCADStore();
```

**Accessing global state**:
```typescript
const { user, logout } = useGlobalStore();
const { theme, setTheme } = useUIStore();
```

**Showing a toast**:
```typescript
import { toast } from 'sonner';
toast.success("Success!");
```

**Opening a dialog**:
```typescript
const [isOpen, setIsOpen] = useState(false);

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>...</DialogContent>
</Dialog>
```

**Keyboard shortcuts**:
- Global shortcuts: `CADLayout.tsx` (useEffect with keydown listener)
- Input-specific: Handle in individual components

---

## Additional Resources

- **Architecture**: [docs/architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)
- **Storage**: [docs/STORAGE_DEBUG_GUIDE.md](STORAGE_DEBUG_GUIDE.md)
- **Extensions**: [src/extensions/EXTENSION_GUIDE.md](../src/extensions/EXTENSION_GUIDE.md)
- **Design Decisions**: [docs/DESIGN.md](DESIGN.md)

---

**Last Updated**: February 13, 2026

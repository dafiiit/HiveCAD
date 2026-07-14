import React from "react";
import * as Icons from "lucide-react";
import {
  Plus,
  X,
  Edit2,
  Check,
  PackagePlus,
  MessageSquareWarning,
  GripVertical,
} from "lucide-react";
import { useCADStore, useCADStoreApi, ToolType } from "@/hooks/useCADStore";
import { toast } from "sonner";
import { ExtensionStoreDialog } from "../extensions/ExtensionStoreDialog";
import { DeveloperFeedbackDialog } from "../ui/DeveloperFeedbackDialog";
import { AddToolDialog } from "./AddToolDialog";
import { Input } from "@/components/ui/input";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Sub-components extracted to toolbar/ ──────────────────────────────────────
import {
  ToolButton,
  ToolGroup,
  SortableTool,
  SortableSection,
  getToolIcon,
  getToolLabel,
  isToolImplemented,
} from "./toolbar/ToolDefs";
import { FolderEditDialog } from "./toolbar/FolderEditDialog";
import { ToolFolderButton } from "./toolbar/ToolFolderButton";

type ToolTab = "SOLID" | "SURFACE" | "MESH" | "SHEET" | "PLASTIC" | "MANAGE" | "UTILITIES" | "SKETCH";




interface RibbonToolbarProps {
  activeTab: ToolTab;
  setActiveTab: (tab: ToolTab) => void;
  isSketchMode: boolean;
  onFinishSketch: () => void;
}

const RibbonToolbar = ({ activeTab, setActiveTab, isSketchMode, onFinishSketch }: RibbonToolbarProps) => {
  const {
    addObject,
    activeTool,
    setActiveTool,
    enterSketchMode,
    duplicateSelected,
    deleteObject,
    selectedIds,
    startOperation,
    objects,
    applyConstraintToSelection,
    activeConstraintType,
    exportSTL,
    exportSTEP,
    exportJSON,
    importFile,
    // New toolbar state
    customToolbars,
    activeToolbarId,
    setActiveToolbar,
    addCustomToolbar,
    deleteCustomToolbar,
    renameCustomToolbar,
    isEditingToolbar,
    setEditingToolbar,
    addSection,
    deleteSection,
    renameSection,
    reorderSections,
    addToolToSection,
    removeToolFromSection,
    reorderToolsInSection,
    moveToolBetweenSections,
    // Folder state
    folders,
    addFolder,
    deleteFolder,
    renameFolder,
    addToolToFolder,
    removeToolFromFolder,
    reorderToolsInFolder
  } = useCADStore();

  const storeApi = useCADStoreApi();

  const [isExtensionStoreOpen, setIsExtensionStoreOpen] = React.useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = React.useState(false);
  const [editingToolbarName, setEditingToolbarName] = React.useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = React.useState<string | null>(null);
  const [addToolDialogOpen, setAddToolDialogOpen] = React.useState(false);
  const [activeTargetSection, setActiveTargetSection] = React.useState<string | null>(null);
  const [isFolderEditDialogOpen, setIsFolderEditDialogOpen] = React.useState(false);
  const [editingFolderId, setEditingFolderId] = React.useState<string | null>(null);
  const [editingFolderSectionId, setEditingFolderSectionId] = React.useState<string | null>(null);
  const hasSketchToolbar = customToolbars.some(t => t.id === 'SKETCH');
  const toolbarIdForLayout = isSketchMode
    ? (hasSketchToolbar ? 'SKETCH' : (activeToolbarId || 'SOLID'))
    : (activeToolbarId || 'SOLID');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !toolbarIdForLayout) return;

    const currentToolbar = customToolbars.find(t => t.id === toolbarIdForLayout);
    if (!currentToolbar) return;

    // Check if dragging a section
    if (String(active.id).startsWith('section-')) {
      const oldIndex = currentToolbar.sections.findIndex(s => `section-${s.id}` === active.id);
      const newIndex = currentToolbar.sections.findIndex(s => `section-${s.id}` === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newSections = arrayMove(currentToolbar.sections, oldIndex, newIndex);
        reorderSections(toolbarIdForLayout, newSections.map(s => s.id));
      }
    }
    // Check if dragging a tool
    else if (String(active.id).startsWith('tool-')) {
      const idPart = String(active.id).replace('tool-', '');
      const lastColonIndex = idPart.lastIndexOf(':');
      const activeToolId = idPart.substring(0, lastColonIndex);
      const sourceSectionId = idPart.substring(lastColonIndex + 1);

      const overIdPart = String(over.id).replace('tool-', '');
      const overLastColonIndex = overIdPart.lastIndexOf(':');
      if (overLastColonIndex === -1) return; // Not a tool
      const overToolId = overIdPart.substring(0, overLastColonIndex);
      const targetSectionId = overIdPart.substring(overLastColonIndex + 1);

      if (sourceSectionId === targetSectionId) {
        // Reorder within same section
        const section = currentToolbar.sections.find(s => s.id === sourceSectionId);
        if (section) {
          const oldIndex = section.toolIds.indexOf(activeToolId);
          const newIndex = section.toolIds.indexOf(overToolId);
          if (oldIndex !== -1 && newIndex !== -1) {
            const newToolIds = arrayMove(section.toolIds, oldIndex, newIndex);
            reorderToolsInSection(toolbarIdForLayout, sourceSectionId, newToolIds);
          }
        }
      } else {
        // Move between sections
        const targetSection = currentToolbar.sections.find(s => s.id === targetSectionId);
        if (targetSection) {
          const newIndex = targetSection.toolIds.indexOf(overToolId);
          moveToolBetweenSections(toolbarIdForLayout, sourceSectionId, targetSectionId, activeToolId, newIndex === -1 ? targetSection.toolIds.length : newIndex);
        }
      }
    }
  };


  const handleCreatePrimitive = (type: 'box' | 'cylinder' | 'sphere' | 'torus' | 'coil' | 'plane') => {
    startOperation(type);
    toast.info(`Configure ${type} parameters`);
  };

  const handleOperation = (type: string) => {
    startOperation(type);
    toast.info(`Configure ${type} parameters`);
  };

  const handleToolSelect = (tool: ToolType) => {
    const implemented = isToolImplemented(tool as string);
    if (!implemented) {
      toast.warning(
        `"${getToolLabel(tool as string)}" is not yet implemented`,
        {
          description: "This tool is coming in the foreseeable future. Need it ASAP? You can create your own custom tool implementation — check out the Extension Guide in the Extensions store or see docs/extensions/EXTENSION_GUIDE.md",
          duration: 6000,
        }
      );
      return;
    }
    setActiveTool(tool);
    toast(`Tool: ${tool}`);
  };

  const handleStartSketch = () => {
    // Toolbar will automatically switch to SKETCH when isSketchMode becomes true
    // No need to persist activeToolbarId change
    enterSketchMode();
    toast.success("Sketch mode activated");
  };

  const handleDuplicate = () => {
    if (selectedIds.size === 0) {
      toast.error("Select objects to duplicate");
      return;
    }
    duplicateSelected();
    toast.success(`Duplicated ${selectedIds.size} object(s)`);
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) {
      toast.error("Select objects to delete");
      return;
    }
    const ids = [...selectedIds];
    ids.forEach(id => deleteObject(id));
    toast.success(`Deleted ${ids.length} object(s)`);
  };

  const handleJoin = () => handleOperation('join');
  const handleCut = () => handleOperation('cut');
  const handleIntersect = () => handleOperation('intersect');

  const handleMeasure = () => {
    toast("Click two points to measure distance");
    setActiveTool('measure');
  };

  const handleImport = () => {
    importFile();
  };


  const idToOnClickMap: Record<string, () => void> = {
    sketch: handleStartSketch,
    extrusion: () => handleOperation('extrusion'),
    revolve: () => handleOperation('revolve'),
    box: () => handleCreatePrimitive('box'),
    cylinder: () => handleCreatePrimitive('cylinder'),
    sphere: () => handleCreatePrimitive('sphere'),
    torus: () => handleCreatePrimitive('torus'),
    coil: () => handleCreatePrimitive('coil'),
    duplicate: handleDuplicate,
    delete: handleDelete,
    join: handleJoin,
    cut: handleCut,
    intersect: handleIntersect,
    fillet: () => handleOperation('fillet'),
    chamfer: () => handleOperation('chamfer'),
    shell: () => handleOperation('shell'),
    measure: handleMeasure,
    import: handleImport,
    export: exportJSON,
    // Constraint tools — apply constraint to current selection
    horizontal: () => applyConstraintToSelection('horizontal'),
    vertical: () => applyConstraintToSelection('vertical'),
    coincident: () => applyConstraintToSelection('coincident'),
    tangent: () => applyConstraintToSelection('tangent'),
    equal: () => applyConstraintToSelection('equal'),
    parallel: () => applyConstraintToSelection('parallel'),
    perpendicular: () => applyConstraintToSelection('perpendicular'),
    fixed: () => applyConstraintToSelection('fixed'),
    midpoint: () => applyConstraintToSelection('midpoint'),
    concentric: () => applyConstraintToSelection('concentric'),
    collinear: () => applyConstraintToSelection('collinear'),
    symmetric: () => applyConstraintToSelection('symmetric'),
    pointOnLine: () => applyConstraintToSelection('pointOnLine'),
    pointOnCircle: () => applyConstraintToSelection('pointOnCircle'),
    equalRadius: () => applyConstraintToSelection('equalRadius'),
    // Modify tools — set as active tool (interaction handled by SketchCanvas)
    trim: () => handleToolSelect('trim' as ToolType),
    offset: () => handleToolSelect('offset' as ToolType),
    mirror: () => handleToolSelect('mirror' as ToolType),
    toggleConstruction: () => handleToolSelect('toggleConstruction' as ToolType),
    dimension: () => handleToolSelect('dimension' as ToolType),
  };

  const activeToolbar = customToolbars.find(t => t.id === toolbarIdForLayout)
    || customToolbars.find(t => t.id === 'SOLID')
    || customToolbars[0];

  return (
    <div className="cad-toolbar">
      {/* Tab bar */}
      <div className="flex items-center border-b border-toolbar-border px-2">
        {customToolbars.map((toolbar) => (
          <div key={toolbar.id} className="group relative flex items-center">
            {editingToolbarName === toolbar.id ? (
              <Input
                className="h-7 w-24 text-xs py-0 px-1 mx-1"
                value={toolbar.name}
                onChange={(e) => renameCustomToolbar(toolbar.id, e.target.value)}
                onBlur={() => setEditingToolbarName(null)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingToolbarName(null)}
                autoFocus
              />
            ) : (
              <button
                onClick={() => {
                  if (isEditingToolbar) {
                    setEditingToolbarName(toolbar.id);
                  } else {
                    // If in sketch mode and clicking non-SKETCH tab, finish sketch first
                    if (isSketchMode && toolbar.id !== 'SKETCH') {
                      onFinishSketch();
                    }
                    setActiveToolbar(toolbar.id);
                    // Auto-enter sketch mode when clicking SKETCH tab
                    if (toolbar.id === 'SKETCH' && !isSketchMode) {
                      enterSketchMode();
                    }
                  }
                }}
                className={`cad-toolbar-tab ${toolbarIdForLayout === toolbar.id ? 'cad-toolbar-tab-active' : ''}`}
              >
                {toolbar.name}
              </button>
            )}
            {isEditingToolbar && toolbarIdForLayout === toolbar.id && toolbar.id !== 'SOLID' && toolbar.id !== 'SKETCH' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCustomToolbar(toolbar.id);
                }}
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
              >
                <X className="w-2 h-2" />
              </button>
            )}
          </div>
        ))}

        <button
          onClick={() => {
            const id = addCustomToolbar();
            setActiveToolbar(id);
            setEditingToolbar(true);
          }}
          className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground ml-1"
          title="Add New Toolbox"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setEditingToolbar(!isEditingToolbar)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${isEditingToolbar
              ? 'bg-primary text-primary-foreground shadow-lg scale-105 font-bold'
              : 'hover:bg-muted text-muted-foreground'
              }`}
            title={isEditingToolbar ? "Finish Editing" : "Edit Toolbox"}
          >
            {isEditingToolbar ? (
              <>
                <Check className="w-4 h-4" />
                <span className="text-xs">FINISH TOOLBOX EDITING</span>
              </>
            ) : (
              <Edit2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Tool ribbon */}
      <div className="flex items-center py-1 px-1 overflow-x-auto min-h-[72px]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeToolbar?.sections.map(s => `section-${s.id}`) || []}
            strategy={horizontalListSortingStrategy}
          >
            {activeToolbar?.sections.map((section) => (
              <SortableSection key={section.id} id={`section-${section.id}`} disabled={!isEditingToolbar}>
                <ToolGroup
                  label={
                    isEditingToolbar ? (
                      editingSectionName === section.id ? (
                        <Input
                          className="h-4 w-20 text-[8px] py-0 px-1 uppercase font-bold text-center bg-transparent border-none"
                          value={section.label}
                          onChange={(e) => renameSection(toolbarIdForLayout!, section.id, e.target.value)}
                          onBlur={() => setEditingSectionName(null)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingSectionName(null)}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="cursor-pointer hover:text-primary transition-colors"
                          onClick={() => setEditingSectionName(section.id)}
                        >
                          {section.label}
                        </span>
                      )
                    ) : (
                      section.label
                    )
                  }
                >
                  <SortableContext
                    items={section.toolIds.map(toolId => `tool-${toolId}:${section.id}`)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {section.toolIds.map((toolId, idx) => {
                      if (toolId.startsWith('folder:')) {
                        const folderId = toolId.replace('folder:', '');
                        const folder = folders[folderId];
                        if (!folder) return null;
                        return (
                          <SortableTool key={`${toolId}-${idx}`} id={`tool-${toolId}:${section.id}`} disabled={!isEditingToolbar}>
                            <ToolFolderButton
                              folderId={folderId}
                              label={folder.label}
                              toolIds={folder.toolIds}
                              isEditing={isEditingToolbar}
                              onEdit={() => {
                                setEditingFolderId(folderId);
                                setEditingFolderSectionId(section.id);
                                setIsFolderEditDialogOpen(true);
                              }}
                              onDelete={() => deleteFolder(toolbarIdForLayout!, section.id, folderId)}
                              onSelectTool={(tid) => handleToolSelect(tid as ToolType)}
                              idToOnClickMap={idToOnClickMap}
                              activeTool={activeTool}
                              activeConstraintType={activeConstraintType}
                            />
                          </SortableTool>
                        );
                      }

                      return (
                        <SortableTool key={`${toolId}-${idx}`} id={`tool-${toolId}:${section.id}`} disabled={!isEditingToolbar}>
                          <ToolButton
                            key={`${toolId}-${activeTool === toolId || activeConstraintType === toolId}`}
                            icon={getToolIcon(toolId, isToolImplemented(toolId))}
                            label={getToolLabel(toolId)}
                            isActive={activeTool === toolId || activeConstraintType === toolId}
                            isImplemented={isToolImplemented(toolId)}
                            onClick={() => {
                              if (idToOnClickMap[toolId]) {
                                idToOnClickMap[toolId]();
                              } else {
                                handleToolSelect(toolId as ToolType);
                              }
                            }}
                          />
                          {isEditingToolbar && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeToolFromSection(toolbarIdForLayout!, section.id, idx);
                              }}
                              className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/tool:opacity-100 transition-opacity z-10"
                            >
                              <X className="w-2 h-2" />
                            </button>
                          )}
                        </SortableTool>
                      );
                    })}
                  </SortableContext>

                  {isEditingToolbar && (
                    <div className="flex gap-1 ml-1 self-center">
                      <button
                        onClick={() => {
                          setActiveTargetSection(section.id);
                          setAddToolDialogOpen(true);
                        }}
                        className="w-8 h-8 rounded-lg border-2 border-dashed border-muted hover:border-primary transition-colors flex items-center justify-center"
                        title="Add Tool"
                      >
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => addFolder(toolbarIdForLayout!, section.id)}
                        className="w-8 h-8 rounded-lg border-2 border-dashed border-muted hover:border-primary transition-colors flex items-center justify-center"
                        title="Add Folder"
                      >
                        <Icons.FolderPlus className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </ToolGroup>
                {isEditingToolbar && (
                  <button
                    onClick={() => deleteSection(toolbarIdForLayout!, section.id)}
                    className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-muted border border-border flex items-center justify-center opacity-0 group-hover/section:opacity-100 transition-opacity hover:bg-destructive hover:text-white z-20"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </SortableSection>
            ))}
          </SortableContext>
        </DndContext>

        {isEditingToolbar && toolbarIdForLayout && (
          <button
            onClick={() => addSection(toolbarIdForLayout)}
            className="flex flex-col items-center justify-center h-12 px-4 border-2 border-dashed border-muted rounded-md hover:border-primary hover:bg-muted/30 transition-all text-muted-foreground hover:text-primary gap-1 ml-2"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase">Section</span>
          </button>
        )}

        <div className="ml-auto flex items-center pr-4 gap-2">
          {!isSketchMode && (
            <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsFeedbackOpen(true)}
                  className="flex flex-col items-center justify-center min-w-[64px] h-[64px] rounded-md hover:bg-muted/50 transition-all text-muted-foreground hover:text-primary border border-transparent hover:border-border/50 group"
                >
                  <MessageSquareWarning className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-medium uppercase tracking-tight">Feedback</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Report bug or suggest feature</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setIsExtensionStoreOpen(true)}
                  className="flex flex-col items-center justify-center min-w-[64px] h-[64px] rounded-md hover:bg-muted/50 transition-all text-muted-foreground hover:text-primary border border-transparent hover:border-border/50 group"
                >
                  <PackagePlus className="w-6 h-6 mb-1 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-medium uppercase tracking-tight">Extensions</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Browse Extension Library</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
            </>
          )}
        </div>
      </div>

      <ExtensionStoreDialog
        open={isExtensionStoreOpen}
        onOpenChange={setIsExtensionStoreOpen}
      />
      <DeveloperFeedbackDialog
        open={isFeedbackOpen}
        onOpenChange={setIsFeedbackOpen}
      />
      <AddToolDialog
        open={addToolDialogOpen}
        onOpenChange={setAddToolDialogOpen}
        onSelectTool={(toolId) => {
          if (toolbarIdForLayout && activeTargetSection) {
            addToolToSection(toolbarIdForLayout, activeTargetSection, toolId);
          }
        }}
      />
      {editingFolderId && folders[editingFolderId] && (
        <FolderEditDialog
          open={isFolderEditDialogOpen}
          onOpenChange={setIsFolderEditDialogOpen}
          folderId={editingFolderId}
          initialLabel={folders[editingFolderId].label}
          toolIds={folders[editingFolderId].toolIds}
          onSave={(label) => {
            renameFolder(editingFolderId, label);
          }}
          onDelete={() => {
            if (toolbarIdForLayout && editingFolderSectionId) {
              deleteFolder(toolbarIdForLayout, editingFolderSectionId, editingFolderId);
            }
          }}
          onAddTool={(tid) => addToolToFolder(editingFolderId, tid)}
          onRemoveTool={(index) => removeToolFromFolder(editingFolderId, index)}
          onReorderTools={(tids) => reorderToolsInFolder(editingFolderId, tids)}
        />
      )}
    </div>
  );
};

export default RibbonToolbar;

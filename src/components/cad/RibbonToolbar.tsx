import React from "react";
import * as Icons from "lucide-react";
import {
  Box,
  Circle,
  Square,
  Triangle,
  Cylinder,
  Hexagon,
  Move,
  RotateCw,
  Scale,
  Copy,
  Scissors,
  Combine,
  SplitSquareVertical,
  Grid3X3,
  Layers,
  Eye,
  Settings2,
  Download,
  Upload,
  Pencil,
  Minus,
  CircleDot,
  Spline,
  RectangleHorizontal,
  Pentagon,
  ArrowUpRight,
  Ruler,
  Crosshair,
  ChevronDown,
  CheckCircle2,
  Trash2,
  MoreHorizontal,
  Anchor,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Equal,
  GitCommit,
  ArrowUpLeft,
  PackagePlus,
  MessageSquareWarning,
  Plus,
  Settings,
  X,
  GripVertical,
  Edit2,
  Check,
  MoreVertical
} from "lucide-react";
import { useCADStore, useCADStoreApi, ToolType } from "@/hooks/useCADStore";
import { toolRegistry } from "@/lib/tools";
import { toast } from "sonner";
import { ExtensionStoreDialog } from "../extensions/ExtensionStoreDialog";
import { DeveloperFeedbackDialog } from "../ui/DeveloperFeedbackDialog";
import { AddToolDialog } from "./AddToolDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconResolver } from "../ui/IconResolver";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ToolTab = "SOLID" | "SURFACE" | "MESH" | "SHEET" | "PLASTIC" | "MANAGE" | "UTILITIES" | "SKETCH";

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  hasDropdown?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
  disabled?: boolean;
  isImplemented?: boolean;
}

const ToolButton = React.forwardRef<HTMLButtonElement, ToolButtonProps>(({ icon, label, isActive, hasDropdown, onClick, disabled, isImplemented = true, ...props }, ref) => (
  <button
    type="button"
    ref={ref}
    onClick={onClick}
    disabled={disabled}
    aria-pressed={isActive}
    className={`cad-tool-button ${isActive ? 'cad-tool-button-active' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${!isImplemented ? 'border-2 border-red-500/50' : ''}`}
    {...props}
  >
    <div className={`cad-tool-button-icon ${!isImplemented ? 'text-red-500' : ''}`} aria-hidden="true">
      {icon}
    </div>
    <div className="flex items-center gap-0.5 mt-auto">
      <span className={`cad-tool-button-label truncate max-w-[48px] leading-[1.1] text-center ${!isImplemented ? 'text-red-500' : ''}`}>{label}</span>
      {hasDropdown && <ChevronDown className={`w-2 h-2 opacity-50 shrink-0 transition-transform duration-200 ${isActive ? 'rotate-180' : ''}`} />}
    </div>
  </button>
));
ToolButton.displayName = 'ToolButton';



/**
 * Check if a tool has full implementation and is functional.
 * Tools with placeholder/stub implementations are marked as not implemented.
 */
const isToolImplemented = (id: string): boolean => {
  const tool = toolRegistry.get(id);
  if (!tool) return false;
  
  // Navigation tools (select, pan, orbit, sketch) are implemented through UI state
  const navigationTools = ['select', 'pan', 'orbit', 'sketch'];
  if (navigationTools.includes(id)) return true;
  
  // Tools with placeholder implementations but not yet functional
  const notImplementedTools = [
    'move', 'rotate', 'scale',           // modify operations
    'join', 'cut', 'intersect',          // boolean operations
    'pattern',                            // configure operations
    'plane', 'axis', 'point',            // construct operations
    'measure', 'analyze',                 // inspect operations
    'parameters',                         // configure operations
    'sketchPoint',                        // sketch construct
    'circle', 'ellipse', 'text', 'polygon', 'rectangle', 'roundedRectangle',  // shape tools
    'bezier', 'cubicBezier', 'smoothSpline', 'quadraticBezier',  // spline tools
  ];
  
  if (notImplementedTools.includes(id)) return false;
  
  // Check if tool has any implementation method
  // Constraint tools are implemented via applyConstraintToSelection, not execute()
  if (tool.metadata.category === 'constrain') return true;
  // Modify tools with uiProperties or execute are implemented
  if (tool.metadata.category === 'modify') return true;
  return !!(tool.execute || tool.create || tool.addToSketch || tool.createShape || tool.processPoints);
};

/**
 * Registry-driven icon resolver - replaces hardcoded idToIconMap
 * Falls back to extension registry for icons
 */
const getToolIcon = (id: string, isImplemented: boolean = true): React.ReactNode => {
  // Check extension registry for icon
  const ext = toolRegistry.get(id);
  const iconName = ext?.metadata?.icon;
  if (iconName) {
    const IconComponent = (Icons as any)[iconName];
    if (IconComponent) {
      return <IconComponent className={`w-5 h-5 ${!isImplemented ? 'opacity-50' : ''}`} />;
    }
  }
  // Fallback: show first 2 chars as text
  return <span className={`text-[10px] font-bold ${!isImplemented ? 'opacity-30' : 'opacity-50'}`}>{id.substring(0, 2).toUpperCase()}</span>;
};

/**
 * Registry-driven label resolver - replaces hardcoded idToLabelMap
 */
const getToolLabel = (id: string): string => {
  const ext = toolRegistry.get(id);
  return ext?.metadata?.label || id;
};

const ToolIcon = ({ id, className }: { id: string, className?: string }) => {
  const { folders } = useCADStore();
  if (id.startsWith('folder:')) {
    const folderId = id.replace('folder:', '');
    const folder = folders[folderId];
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <IconResolver name={folder?.icon || 'Package'} />
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      {getToolIcon(id)}
    </div>
  );
};

interface FolderEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  initialLabel: string;
  onSave: (label: string) => void;
  onDelete: () => void;
  toolIds: string[];
  onRemoveTool: (index: number) => void;
  onAddTool: (toolId: string) => void;
  onReorderTools: (toolIds: string[]) => void;
}

const SortableFolderTool = ({ id, toolId, label, icon, isPrimary, onRemove }: {
  id: string,
  toolId: string,
  label: string,
  icon: React.ReactNode,
  isPrimary: boolean,
  onRemove: () => void
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  const implemented = isToolImplemented(toolId);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-2 rounded-xl bg-background/40 hover:bg-background/60 border transition-colors group ${implemented ? 'border-border/10' : 'border-red-500/30'} ${isPrimary ? 'border-b-2 border-b-dashed border-b-primary/40' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors">
          <GripVertical size={14} />
        </div>
        <div className={`w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center ${implemented ? 'text-muted-foreground' : 'text-red-500'}`}>
          {icon}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${!implemented ? 'text-red-500' : ''}`}>{label}</span>
          {isPrimary && (
            <span className="text-[9px] uppercase tracking-wider font-bold text-primary/80">Main</span>
          )}
        </div>
      </div>
      <button
        onClick={onRemove}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

const FolderEditDialog = ({
  open,
  onOpenChange,
  folderId,
  initialLabel,
  onSave,
  onDelete,
  toolIds,
  onRemoveTool,
  onAddTool,
  onReorderTools,
}: FolderEditDialogProps) => {
  const [label, setLabel] = React.useState(initialLabel);
  const [addToolDialogOpen, setAddToolDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setLabel(initialLabel);
    }
  }, [open, initialLabel]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = toolIds.findIndex(id => id === active.id);
      const newIndex = toolIds.findIndex(id => id === over.id);
      onReorderTools(arrayMove(toolIds, oldIndex, newIndex));
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-[450px] rounded-[2rem] bg-background/95 backdrop-blur-md border-border/40 p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">Edit Folder</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid gap-4 p-4 rounded-3xl bg-muted/20 border border-border/20">
              <div className="grid gap-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Folder Identity</label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Folder Name"
                  className="rounded-xl border-border/50 bg-background/50 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Tools in Folder</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddToolDialogOpen(true)}
                  className="h-7 rounded-lg text-primary hover:text-primary hover:bg-primary/10 gap-1 px-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase">Add Tool</span>
                </Button>
              </div>

              <div className="rounded-3xl border border-border/20 bg-muted/10 overflow-hidden">
                <ScrollArea className="h-[250px]">
                  {toolIds.length > 0 ? (
                    <div className="p-2">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={toolIds}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="grid gap-1">
                            {toolIds.map((toolId, idx) => (
                              <SortableFolderTool
                                key={`${toolId}-${idx}`}
                                id={toolId}
                                toolId={toolId}
                                label={getToolLabel(toolId)}
                                icon={getToolIcon(toolId, isToolImplemented(toolId))}
                                isPrimary={idx === 0}
                                onRemove={() => onRemoveTool(idx)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-muted/20 flex items-center justify-center">
                        <Icons.Package size={20} className="opacity-20" />
                      </div>
                      <p className="text-xs font-medium italic opacity-50">No tools in this folder</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/20">
            <Button
              variant="ghost"
              onClick={() => { onDelete(); onOpenChange(false); }}
              className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 gap-2 px-4 h-10"
            >
              <Trash2 size={16} />
              <span className="font-bold text-xs uppercase tracking-tight">Delete Folder</span>
            </Button>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl h-10 px-6 font-semibold text-xs uppercase tracking-tight">Cancel</Button>
              <Button onClick={() => { onSave(label); onOpenChange(false); }} className="rounded-xl h-10 px-8 font-bold text-xs uppercase tracking-tight shadow-lg shadow-primary/20">Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddToolDialog
        open={addToolDialogOpen}
        onOpenChange={setAddToolDialogOpen}
        onSelectTool={(tid) => {
          onAddTool(tid);
          setAddToolDialogOpen(false);
        }}
      />
    </>
  );
};

interface ToolFolderButtonProps {
  folderId: string;
  label: string;
  toolIds: string[];
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSelectTool: (toolId: string) => void;
  idToOnClickMap: Record<string, () => void>;
  activeTool: string | null;
}

const ToolFolderButton = ({
  folderId,
  label,
  toolIds,
  isEditing,
  onEdit,
  onDelete,
  onSelectTool,
  idToOnClickMap,
  activeTool
}: ToolFolderButtonProps) => {
  const isActive = toolIds.includes(activeTool || '');
  const hasImplementedTools = toolIds.some(tid => isToolImplemented(tid));
  const mainToolId = toolIds[0];
  const mainToolImplemented = mainToolId ? isToolImplemented(mainToolId) : false;

  const handleMainToolSelect = () => {
    if (!mainToolId) return;
    if (idToOnClickMap[mainToolId]) {
      idToOnClickMap[mainToolId]();
      return;
    }
    onSelectTool(mainToolId);
  };

  if (isEditing) {
    return (
      <div className="relative group/folder flex h-full">
        <ToolButton
          icon={mainToolId ? getToolIcon(mainToolId, mainToolImplemented) : <Icons.Package className="w-5 h-5" />}
          label={label}
          isActive={isActive}
          hasDropdown
          isImplemented={hasImplementedTools}
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
        />
      </div>
    );
  }

  return (
    <div className="relative group/folder flex h-full">
      <DropdownMenu>
        <div className={`cad-tool-button ${isActive ? 'cad-tool-button-active' : ''} ${!hasImplementedTools ? 'border-2 border-red-500/50' : ''}`}>
          <button
            type="button"
            onClick={handleMainToolSelect}
            disabled={!mainToolId}
            className="w-full flex-1 flex items-center justify-center rounded-md hover:bg-secondary/60 transition-colors disabled:opacity-50"
            title={mainToolId ? `Select ${getToolLabel(mainToolId)}` : 'No tools in folder'}
          >
            <div className={`cad-tool-button-icon ${!mainToolImplemented && mainToolId ? 'text-red-500' : ''}`}>
              {mainToolId ? getToolIcon(mainToolId, mainToolImplemented) : <Icons.Package className="w-5 h-5 opacity-40" />}
            </div>
          </button>

          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-full mt-auto flex items-center justify-center gap-0.5 pt-1 border-t border-border/30 rounded-b-md hover:bg-secondary/60 transition-colors"
              title={`Open ${label} folder tools`}
            >
              <span className="cad-tool-button-label truncate max-w-[48px] leading-[1.1] text-center">{label}</span>
              <ChevronDown className={`w-2 h-2 opacity-50 shrink-0 transition-transform duration-200 ${isActive ? 'rotate-180' : ''}`} />
            </button>
          </DropdownMenuTrigger>
        </div>

        <DropdownMenuContent align="start" className="w-[200px] p-2 rounded-2xl backdrop-blur-xl bg-background/90 shadow-2xl border-border/40">
          <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-2">
            {label}
          </DropdownMenuLabel>
          <div className="grid grid-cols-1 gap-1">
            {toolIds.length > 0 ? (
              toolIds.map((toolId) => {
                const implemented = isToolImplemented(toolId);
                return (
                <DropdownMenuItem
                  key={toolId}
                  onClick={() => {
                    if (idToOnClickMap[toolId]) {
                      idToOnClickMap[toolId]();
                    } else {
                      onSelectTool(toolId);
                    }
                  }}
                  className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all duration-200 group/item ${activeTool === toolId ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'} ${!implemented ? 'border border-red-500/30' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center transition-colors ${activeTool === toolId ? 'border-primary/30 text-primary' : !implemented ? 'border-red-500/50 text-red-500' : 'text-muted-foreground group-hover/item:text-primary group-hover/item:border-primary/30'}`}>
                    {getToolIcon(toolId, implemented)}
                  </div>
                  <span className={`text-xs font-semibold ${!implemented ? 'text-red-500' : ''}`}>{getToolLabel(toolId)}</span>
                </DropdownMenuItem>
              );
              })
            ) : (
              <div className="py-8 text-center text-muted-foreground text-[10px] italic">
                Empty Folder
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

interface ToolGroupProps {
  label: React.ReactNode;
  children: React.ReactNode;
}

const ToolGroup = ({ label, children }: ToolGroupProps) => (
  <div className="cad-tool-group">
    <div className="flex flex-col">
      <div className="flex items-end gap-0.5">
        {children}
      </div>
      <span className="cad-tool-group-label">{label}</span>
    </div>
  </div>
);

const SortableTool = ({ id, children, disabled }: { id: string, children: React.ReactNode, disabled?: boolean }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative group/tool">
      {children}
    </div>
  );
};

const SortableSection = ({ id, children, disabled }: { id: string, children: React.ReactNode, disabled?: boolean }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/section flex items-stretch">
      <div {...attributes} {...listeners} className={`flex items-center px-0.5 cursor-grab active:cursor-grabbing hover:bg-muted/50 rounded transition-colors ${disabled ? 'hidden' : ''}`}>
        <GripVertical className="w-3 h-3 text-muted-foreground/50" />
      </div>
      {children}
    </div>
  );
};

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

  const handleJoin = () => {
    storeApi.getState().executeOperation('join');
  };

  const handleCut = () => {
    storeApi.getState().executeOperation('cut');
  };

  const handleIntersect = () => {
    storeApi.getState().executeOperation('intersect');
  };

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
                            />
                          </SortableTool>
                        );
                      }

                      return (
                        <SortableTool key={`${toolId}-${idx}`} id={`tool-${toolId}:${section.id}`} disabled={!isEditingToolbar}>
                          <ToolButton
                            icon={getToolIcon(toolId, isToolImplemented(toolId))}
                            label={getToolLabel(toolId)}
                            isActive={activeTool === toolId}
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
